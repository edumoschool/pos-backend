import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  private async resolveImageUrl<T extends { imageUrl?: string | null }>(product: T): Promise<T> {
    if (product.imageUrl) {
      return { ...product, imageUrl: await this.minio.getImageUrl(product.imageUrl) };
    }
    return { ...product, imageUrl: null };
  }

  async create(tenantId: string, dto: CreateProductDto, image?: Express.Multer.File) {
    const { quantity, minQuantity, ...productData } = dto;

    if (image) {
      productData.imageUrl = await this.minio.uploadImage(
        image.buffer,
        image.originalname,
        image.mimetype,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: { ...productData, tenantId } as any,
        include: { category: true, brandCategory: true, unit: true },
      });

      await tx.inventory.create({
        data: {
          productId: product.id,
          tenantId,
          quantity: quantity ?? 0,
          minQuantity: minQuantity ?? 0,
        },
      });

      const created = await tx.product.findUnique({
        where: { id: product.id },
        include: { category: true, brandCategory: true, unit: true, inventory: true },
      });
      const inventory = created.inventory && created.inventory.length > 0 ? created.inventory[0] : null;
      return this.resolveImageUrl({
        ...created,
        inventoryStatus: inventory && inventory.quantity <= (inventory.minQuantity || 0) ? 'low-stock' : 'in-stock',
      });
    });
  }

  async findAll(tenantId: string, search?: string, categoryId?: string, brandCategoryId?: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = {
      tenantId,
      isActive: true,
      ...(categoryId && { categoryId }),
      ...(brandCategoryId && { brandCategoryId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: true, brandCategory: true, unit: true, inventory: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);
    const data = await Promise.all(rows.map(async product => {
      const inventory = product.inventory && product.inventory.length > 0 ? product.inventory[0] : null;
      return this.resolveImageUrl({
        ...product,
        inventoryStatus: inventory && inventory.quantity <= (inventory.minQuantity || 0) ? 'low-stock' : 'in-stock',
      });
    }));
    return paginated(data, total, p, l);
  }

  async findOne(id: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        brandCategory: true,
        unit: true,
        inventory: true,
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    const inventory = product.inventory && product.inventory.length > 0 ? product.inventory[0] : null;
    return this.resolveImageUrl({
      ...product,
      inventoryStatus: inventory && inventory.quantity <= (inventory.minQuantity || 0) ? 'low-stock' : 'in-stock',
    });
  }

  async update(id: string, tenantId: string, dto: UpdateProductDto) {
    await this.findOne(id, tenantId);
    const { quantity, minQuantity, ...productData } = dto as any;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: productData,
      });

      // Sync inventory fields if provided
      if (quantity !== undefined || minQuantity !== undefined) {
        await tx.inventory.updateMany({
          where: { productId: id, tenantId },
          data: {
            ...(quantity !== undefined && { quantity }),
            ...(minQuantity !== undefined && { minQuantity }),
          },
        });
      }

      const updated = await tx.product.findUnique({
        where: { id },
        include: { category: true, brandCategory: true, unit: true, inventory: true },
      });
      const inventory = updated.inventory && updated.inventory.length > 0 ? updated.inventory[0] : null;
      return this.resolveImageUrl({
        ...updated,
        inventoryStatus: inventory && inventory.quantity <= (inventory.minQuantity || 0) ? 'low-stock' : 'in-stock',
      });
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async uploadImage(id: string, tenantId: string, file: Express.Multer.File) {
    const product = await this.findOne(id, tenantId);

    if (product.imageUrl) {
      await this.minio.deleteImage(product.imageUrl);
    }

    const objectName = await this.minio.uploadImage(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const updated = await this.prisma.product.update({
      where: { id },
      data: { imageUrl: objectName },
      include: { category: true, brandCategory: true, unit: true },
    });
    return this.resolveImageUrl(updated);
  }

  async removeImage(id: string, tenantId: string) {
    const product = await this.findOne(id, tenantId);

    if (product.imageUrl) {
      await this.minio.deleteImage(product.imageUrl);
    }

    return this.prisma.product.update({
      where: { id },
      data: { imageUrl: null },
      include: { category: true, brandCategory: true, unit: true },
    });
  }

  async getImageUrl(objectName: string): Promise<string> {
    return this.minio.getImageUrl(objectName);
  }
}

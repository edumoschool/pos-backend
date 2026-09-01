import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { I18nNotFoundException } from '../i18n/i18n.exception';
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

  /**
   * `inventory.quantity`/`minQuantity` are Prisma.Decimal objects — comparing
   * them directly with `<=` coerces both to strings and compares
   * lexicographically ("195" <= "20" is true!), not numerically. Convert to
   * Number first.
   */
  private inventoryStatus(inventory: { quantity: unknown; minQuantity: unknown } | null): 'low-stock' | 'in-stock' {
    if (!inventory) return 'in-stock';
    return Number(inventory.quantity) <= Number(inventory.minQuantity ?? 0) ? 'low-stock' : 'in-stock';
  }

  async create(tenantId: string, dto: CreateProductDto, image?: Express.Multer.File) {
    const { quantity, minQuantity, supplierId, ...productData } = dto;

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
          supplierId: supplierId ?? null,
          quantity: quantity ?? 0,
          minQuantity: minQuantity ?? 0,
          // Seed the inventory's own cost fields from the product so sale-item
          // cost snapshots and stock-value reports aren't silently priced at 0
          // until someone happens to touch the inventory record directly.
          costPrice: productData.costPrice ?? 0,
          costCurrency: productData.currency ?? 'UZS',
        },
      });

      const created = await tx.product.findUnique({
        where: { id: product.id },
        include: { category: true, brandCategory: true, unit: true, inventory: true },
      });
      const inventory = created.inventory && created.inventory.length > 0 ? created.inventory[0] : null;
      return this.resolveImageUrl({
        ...created,
        inventoryStatus: this.inventoryStatus(inventory),
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
          { sku: { contains: search, mode: 'insensitive' as const } },
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
        inventoryStatus: this.inventoryStatus(inventory),
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
    if (!product) throw new I18nNotFoundException('errors.product.notFound');
    const inventory = product.inventory && product.inventory.length > 0 ? product.inventory[0] : null;
    return this.resolveImageUrl({
      ...product,
      inventoryStatus: this.inventoryStatus(inventory),
    });
  }

  async update(id: string, tenantId: string, dto: UpdateProductDto) {
    await this.findOne(id, tenantId);
    const { quantity, minQuantity, supplierId, ...productData } = dto as any;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: productData,
      });

      // Sync inventory fields if provided — costPrice/currency/supplier included, so
      // the inventory record (used for sale-item cost snapshots and stock-value
      // reports) never drifts from what the product form actually saved.
      if (
        quantity !== undefined ||
        minQuantity !== undefined ||
        supplierId !== undefined ||
        productData.costPrice !== undefined ||
        productData.currency !== undefined
      ) {
        await tx.inventory.updateMany({
          where: { productId: id, tenantId },
          data: {
            ...(quantity !== undefined && { quantity }),
            ...(minQuantity !== undefined && { minQuantity }),
            ...(supplierId !== undefined && { supplierId }),
            ...(productData.costPrice !== undefined && { costPrice: productData.costPrice }),
            ...(productData.currency !== undefined && { costCurrency: productData.currency }),
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
        inventoryStatus: this.inventoryStatus(inventory),
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

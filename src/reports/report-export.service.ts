import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { ReportsService } from './reports.service';
import { ExportReportDto, ExportReportType, ExportFormat } from './dto/export-report.dto';

@Injectable()
export class ReportExportService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
    private reportsService: ReportsService,
  ) {}

  async exportReport(tenantId: string, userId: string, dto: ExportReportDto) {
    const data = await this.getReportData(tenantId, dto);
    const { buffer, contentType, extension } = this.generateFile(data, dto.format, dto.reportType);

    const fileName = `${dto.reportType}-${Date.now()}.${extension}`;
    const objectKey = await this.minioService.uploadReport(buffer, fileName, contentType);

    const report = await this.prisma.report.create({
      data: {
        tenantId,
        userId,
        name: fileName,
        format: dto.format as any,
        objectKey,
        size: buffer.length,
      },
    });

    const url = await this.minioService.getFileUrl(objectKey);

    return { ...report, url };
  }

  async getReports(tenantId: string) {
    return this.prisma.report.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  async getReportUrl(tenantId: string, reportId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, tenantId },
    });
    if (!report) throw new BadRequestException('Report not found');

    const url = await this.minioService.getFileUrl(report.objectKey);
    return { url, name: report.name, format: report.format };
  }

  async deleteReport(tenantId: string, reportId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, tenantId },
    });
    if (!report) throw new BadRequestException('Report not found');

    await this.minioService.deleteImage(report.objectKey);
    await this.prisma.report.delete({ where: { id: reportId } });

    return { message: 'Report deleted successfully' };
  }

  private async getReportData(tenantId: string, dto: ExportReportDto): Promise<any> {
    switch (dto.reportType) {
      case ExportReportType.FINANCIAL_SUMMARY:
        return this.reportsService.financialSummary(tenantId, dto.branchId, dto.from, dto.to);
      case ExportReportType.TRANSACTIONS_BY_DAY:
        return this.reportsService.transactionsByDay(tenantId, dto.branchId, dto.from, dto.to);
      case ExportReportType.EXPENSES_BY_CATEGORY:
        return this.reportsService.expensesByCategory(tenantId, dto.branchId, dto.from, dto.to);
      case ExportReportType.INCOME_BY_CATEGORY:
        return this.reportsService.incomeByCategory(tenantId, dto.branchId, dto.from, dto.to);
      case ExportReportType.INVENTORY:
        return this.reportsService.inventoryReport(tenantId);
      case ExportReportType.CLIENT_BALANCES:
        return this.reportsService.clientBalances(tenantId);
      case ExportReportType.SUPPLIER_BALANCES:
        return this.reportsService.supplierBalances(tenantId);
      default:
        throw new BadRequestException('Invalid report type');
    }
  }

  private generateFile(
    data: any,
    format: ExportFormat,
    reportType: string,
  ): { buffer: Buffer; contentType: string; extension: string } {
    switch (format) {
      case ExportFormat.CSV:
        return this.generateCsv(data, reportType);
      case ExportFormat.EXCEL:
        return this.generateExcel(data, reportType);
      case ExportFormat.PDF:
        return this.generatePdf(data, reportType);
      default:
        throw new BadRequestException('Invalid export format');
    }
  }

  private generateCsv(data: any, reportType: string): { buffer: Buffer; contentType: string; extension: string } {
    const rows = this.flattenData(data, reportType);
    if (rows.length === 0) {
      return { buffer: Buffer.from('No data', 'utf-8'), contentType: 'text/csv', extension: 'csv' };
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((h) => {
          const val = row[h] ?? '';
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : String(val);
        }).join(','),
      ),
    ];

    const buffer = Buffer.from(csvLines.join('\n'), 'utf-8');
    return { buffer, contentType: 'text/csv', extension: 'csv' };
  }

  private generateExcel(data: any, reportType: string): { buffer: Buffer; contentType: string; extension: string } {
    // Generate as tab-separated values (TSV) which Excel can open natively
    // For full .xlsx support, install exceljs package
    const rows = this.flattenData(data, reportType);
    if (rows.length === 0) {
      return { buffer: Buffer.from('No data', 'utf-8'), contentType: 'application/vnd.ms-excel', extension: 'xls' };
    }

    const headers = Object.keys(rows[0]);
    const tsvLines = [
      headers.join('\t'),
      ...rows.map((row) => headers.map((h) => String(row[h] ?? '')).join('\t')),
    ];

    const buffer = Buffer.from(tsvLines.join('\n'), 'utf-8');
    return { buffer, contentType: 'application/vnd.ms-excel', extension: 'xls' };
  }

  private generatePdf(data: any, reportType: string): { buffer: Buffer; contentType: string; extension: string } {
    // Generate a simple text-based PDF
    // For rich PDF generation, install pdfkit or puppeteer
    const rows = this.flattenData(data, reportType);
    const title = reportType.replace(/-/g, ' ').toUpperCase();
    const content = rows.length > 0
      ? `${title}\n${'='.repeat(title.length)}\n\n${Object.keys(rows[0]).join(' | ')}\n${rows.map((r) => Object.values(r).join(' | ')).join('\n')}`
      : `${title}\n\nNo data available`;

    // Minimal PDF structure
    const pdfContent = this.buildMinimalPdf(content);
    return { buffer: pdfContent, contentType: 'application/pdf', extension: 'pdf' };
  }

  private buildMinimalPdf(text: string): Buffer {
    const lines = text.split('\n');
    const pageContent = lines.map((line, i) => `BT /F1 10 Tf 50 ${750 - i * 14} Td (${line.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n');

    const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${pageContent.length}>>
stream
${pageContent}
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Courier>>endobj
xref
0 6
0000000000 65535 f 
trailer<</Size 6/Root 1 0 R>>
startxref
0
%%EOF`;

    return Buffer.from(pdf, 'utf-8');
  }

  private flattenData(data: any, reportType: string): Record<string, any>[] {
    if (Array.isArray(data)) return data;

    // For single-object reports like financialSummary
    if (typeof data === 'object' && data !== null) {
      if (data.items && Array.isArray(data.items)) return data.items;
      return [data];
    }

    return [];
  }
}

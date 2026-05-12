import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportExportService } from './report-export.service';
import { ReportsController } from './reports.controller';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportExportService],
  exports: [ReportsService],
})
export class ReportsModule {}

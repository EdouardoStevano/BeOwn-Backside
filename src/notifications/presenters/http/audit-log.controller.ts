import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { AuditLogService } from '../../applications/audit-log.service';

@ApiTags('Audit Logs (Admin)')
@ApiBearerAuth()
@RequirePermission('audit:read')
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @ApiOperation({ summary: "Journal d'activité paginé et filtrable" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'acteurId', required: false })
  @ApiQuery({ name: 'action', required: false, description: 'Préfixe, ex. "POST /admin/retraits"' })
  @ApiQuery({ name: 'objetType', required: false })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'ISO 8601' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'ISO 8601' })
  @Get()
  findFiltered(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('acteurId') acteurId?: string,
    @Query('action') action?: string,
    @Query('objetType') objetType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.auditLogService.findFiltered({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      acteurId,
      action,
      objetType,
      dateFrom,
      dateTo,
    });
  }
}

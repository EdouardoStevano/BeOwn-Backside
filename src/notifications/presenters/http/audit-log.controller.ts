import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditLogService } from '../../applications/audit-log.service';

@ApiTags('Audit Logs (Admin)')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @ApiOperation({ summary: 'Lister tous les logs (admin)' })
  @ApiResponse({ status: 200, description: 'Liste des logs' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Get()
  findAll(@Query('limit') limit?: number) {
    return this.auditLogService.findAll(limit);
  }

  @ApiOperation({ summary: 'Logs par acteur' })
  @ApiResponse({ status: 200, description: 'Logs de l\'acteur' })
  @Get('actor/:actorId')
  findByActor(@Param('actorId') actorId: string) {
    return this.auditLogService.findByActor(actorId);
  }

  @ApiOperation({ summary: 'Logs par type d\'objet' })
  @ApiResponse({ status: 200, description: 'Logs du type d\'objet' })
  @Get('object-type/:objetType')
  findByObjectType(@Param('objetType') objetType: string) {
    return this.auditLogService.findByObjectType(objetType);
  }
}

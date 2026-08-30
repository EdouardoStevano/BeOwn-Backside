import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';

export class SetPepFlagDto {
  @ApiProperty() @IsBoolean() pepFlagged: boolean;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pepNote?: string;
}

/**
 * Endpoints compliance — gestion PEP (Personne Politiquement Exposée).
 * Phase 10 stub : flag manuel posé/retiré par l'équipe compliance.
 * À étendre Phase 11 avec intégration vendor (SumSub, ComplyAdvantage).
 */
@ApiTags('Admin — Compliance')
@ApiBearerAuth()
@Controller('admin/compliance')
@UseGuards(JwtAuthGuard)
@RequirePermission('aml:manage')
export class AdminComplianceController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get('pep')
  @ApiOperation({ summary: 'Liste des utilisateurs flaggés PEP' })
  async listPep() {
    return this.userRepo.find({
      where: { pepFlagged: true },
      select: [
        'userId',
        'firstname',
        'lastname',
        'pepFlagged',
        'pepNote',
        'role',
        'createdAt',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  @Post('pep/:userId')
  @ApiOperation({ summary: 'Activer ou désactiver le flag PEP sur un utilisateur' })
  async setPep(
    @Param('userId') userIdStr: string,
    @Body() dto: SetPepFlagDto,
    @CurrentUser() admin: ActiveUser,
  ) {
    const targetUserId = parseInt(userIdStr, 10);
    if (!Number.isFinite(targetUserId)) {
      throw new BadRequestException('userId invalide.');
    }
    const user = await this.userRepo.findOne({
      where: { userId: targetUserId },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    user.pepFlagged = dto.pepFlagged;
    user.pepNote = dto.pepNote ?? null;
    const saved = await this.userRepo.save(user);

    await this.auditLog
      .create(
        String(admin.userId),
        admin.role ?? UserRole.COMPLIANCE,
        dto.pepFlagged ? 'compliance.pep.flag' : 'compliance.pep.unflag',
        'user',
        String(targetUserId),
        undefined,
        undefined,
        { pepNote: dto.pepNote ?? null },
      )
      .catch(() => {});

    return {
      userId: saved.userId,
      pepFlagged: saved.pepFlagged,
      pepNote: saved.pepNote,
    };
  }
}

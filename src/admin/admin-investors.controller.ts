import {
  Controller, ForbiddenException, Get, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity, UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { RiskScoringService } from 'src/profiles/applications/risk-scoring.service';

const ADMIN_ROLES: string[] = rolesWithPermission('users:read');

@ApiTags('Admin — Suivi investisseurs')
@ApiBearerAuth()
@Controller('admin/investors')
@UseGuards(JwtAuthGuard)
@RequirePermission('users:read')
export class AdminInvestorsController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly riskScoring: RiskScoringService,
  ) {}

  private async assertAdmin(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  @ApiOperation({ summary: 'Liste des investisseurs à contacter (surveillance périodique PSFP)' })
  @Get('due-contacts')
  async dueContacts(@CurrentUser() user: ActiveUser) {
    await this.assertAdmin(user.userId);
    return this.riskScoring.listDueContacts();
  }
}

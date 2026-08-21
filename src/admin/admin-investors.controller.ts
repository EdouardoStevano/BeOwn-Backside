import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { rolesWithPermission } from 'src/iam/domain/policies/role-permissions.policy';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { RiskScoringService } from 'src/iam/application/services/risk-scoring.service';

const ADMIN_ROLES: string[] = rolesWithPermission('users:read');
const ROLE_ASSIGN_ROLES: string[] = rolesWithPermission('roles:assign');

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

  private async assertRoleAssign(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ROLE_ASSIGN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  @ApiOperation({ summary: 'Liste des investisseurs à contacter (surveillance périodique PSFP)' })
  @Get('due-contacts')
  async dueContacts(@CurrentUser() user: ActiveUser) {
    await this.assertAdmin(user.userId);
    return this.riskScoring.listDueContacts();
  }

  @ApiOperation({ summary: "Changer le rôle d'un utilisateur (super_admin)" })
  @RequirePermission('roles:assign')
  @Patch(':userId/role')
  async changeRole(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { role: string },
    @CurrentUser() admin: ActiveUser,
  ) {
    await this.assertRoleAssign(admin.userId);
    if (!Object.values(UserRole).includes(body.role as UserRole)) {
      throw new BadRequestException(`Rôle inconnu: ${body.role}`);
    }
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (String(admin.userId) === String(userId)) {
      throw new BadRequestException('Impossible de modifier son propre rôle.');
    }
    if (
      user.role === UserRole.SUPER_ADMIN &&
      body.role !== UserRole.SUPER_ADMIN
    ) {
      const remaining = await this.userRepo.count({
        where: { role: UserRole.SUPER_ADMIN },
      });
      if (remaining <= 1) {
        throw new BadRequestException('Impossible de rétrograder le dernier super admin.');
      }
    }
    user.role = body.role as UserRole;
    await this.userRepo.save(user);
    return { userId, role: user.role };
  }
}

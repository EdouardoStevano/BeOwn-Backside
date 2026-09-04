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
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { SessionCacheService } from 'src/iam/applications/services/session-cache.service';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { RiskScoringService } from 'src/profiles/applications/risk-scoring.service';

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
    private readonly sessionCache: SessionCacheService,
    private readonly auditLog: AuditLogService,
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

  @ApiOperation({
    summary: "Changer le rôle d'un utilisateur (super_admin)",
    description:
      "Prend effet immédiatement : la session en cours de l'utilisateur ciblé est invalidée (son refresh token est révoqué), il devra se reconnecter pour obtenir un token portant son nouveau rôle. Le changement est journalisé dans l'audit avec l'ancien et le nouveau rôle.",
  })
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
    const ancienRole = user.role;
    user.role = body.role as UserRole;
    await this.userRepo.save(user);

    // Le rôle vit dans le JWT : sans révocation, la cible garderait ses anciens
    // droits jusqu'à l'expiration de son access token et, avant le correctif de
    // `TokenService`, indéfiniment en faisant tourner son refresh token. La
    // rotation est donc coupée ici — reconnexion obligatoire, ce qui est
    // exactement ce qu'on veut d'une rétrogradation.
    //
    // LIMITE ASSUMÉE : l'access token déjà émis reste signé et valide jusqu'à
    // son expiration (`JWT_ACCESS_TOKEN_TTL`, 1 h par défaut). Le refermer
    // supposerait une liste de révocation par jeton, hors périmètre de ce
    // correctif.
    const email = user.userEmail?.email ?? null;
    if (email) {
      await this.sessionCache.invalidateRefreshTokenId(email);
    }

    // L'interceptor d'audit global journalise déjà la requête, mais il ne
    // connaît que le corps reçu : il ignore l'ancien rôle, c'est-à-dire la
    // seule information qui permette de relire une rétrogradation. Entrée
    // métier explicite, donc, avec les deux rôles et l'effet sur la session.
    await this.auditLog.create(
      String(admin.userId),
      admin.role ?? UserRole.SUPER_ADMIN,
      'user.role.change',
      // `users` et non `user` : c'est la clé que `describeAuditAction` sait
      // rendre en français (« un utilisateur ») à la lecture du journal.
      'users',
      String(userId),
      undefined,
      undefined,
      { ancienRole, nouveauRole: user.role, sessionInvalidee: email !== null },
    );

    return { userId, role: user.role, sessionInvalidee: email !== null };
  }
}

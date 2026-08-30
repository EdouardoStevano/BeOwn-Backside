import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import {
  KIND_VERSEMENT_PORTEUR,
  ProjectLedgerService,
} from 'src/wallets/applications/project-ledger.service';
import { EtatFinancierProjet } from 'src/wallets/domains/etat-financier-projet';
import {
  DeclarerVersementPorteurDto,
  ListerEtatsFinanciersDto,
} from '../dto/versement-porteur.dto';

/**
 * Rôles habilités, résolus depuis la matrice — `funds:disburse` est la
 * permission « argent sortant » du back-office (super_admin, cio, financier).
 * Il n'existe pas de `finance:read` dans la matrice ; la lecture de l'état
 * financier est portée par la même permission que la constatation du
 * versement : cet écran est l'outil de travail de ceux qui versent.
 */
const ROLES_FINANCE: string[] = rolesWithPermission('funds:disburse');

/**
 * Écran financier projet du back-office (lot 7b).
 *
 * GARANTIE ABSOLUE : aucun flux d'argent réel ne part d'ici. La lecture
 * expose le grand livre interne ; la déclaration de versement enregistre un
 * virement DÉJÀ effectué hors plateforme, sans appeler aucun prestataire.
 */
@ApiTags('Admin — Finance projet')
@ApiBearerAuth()
@Controller('admin/projets')
@RequirePermission('funds:disburse')
export class AdminProjectFinanceController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    private readonly projectLedger: ProjectLedgerService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Défense en profondeur : le rôle est relu en BASE, pas seulement dans le
   * JWT — même montage que les autres contrôleurs admin. Un token forgé ou
   * antérieur à un retrait de rôle est refusé ici.
   */
  private async assertFinance(userId: number): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ROLES_FINANCE.includes(user.role)) {
      throw new ForbiddenException('Accès réservé à l’équipe financière.');
    }
    return user;
  }

  @ApiOperation({
    summary:
      'Tableau financier paginé : une ligne par projet, pour l’écran de suivi des versements',
  })
  @ApiResponse({ status: 200, description: 'Page d’états financiers' })
  @ApiResponse({ status: 403, description: 'Rôle non habilité' })
  @Get('etat-financier')
  async listerEtatsFinanciers(
    @CurrentUser() user: ActiveUser,
    @Query() query: ListerEtatsFinanciersDto,
  ) {
    await this.assertFinance(user.userId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));

    const qb = this.projectRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.titre', 'p.statut']);
    if (query.statut) {
      qb.andWhere('p.statut = :statut', { statut: query.statut });
    }
    const [projets, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Un seul aller-retour d'agrégats pour toute la page : pas de N+1.
    const etats = await this.projectLedger.etatFinancierParProjets(
      projets.map((p) => p.id),
    );

    return {
      items: projets.map((projet) => ({
        projetId: projet.id,
        titre: projet.titre,
        statutProjet: projet.statut,
        ...etats.get(projet.id),
      })),
      total,
      page,
      limit,
    };
  }

  @ApiOperation({
    summary:
      'État financier d’un projet : collecté, frais retenus, net à verser, déjà versé, restant dû',
  })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'État financier du projet' })
  @ApiResponse({ status: 403, description: 'Rôle non habilité' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Get(':id/etat-financier')
  async etatFinancier(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUser,
  ): Promise<EtatFinancierProjet> {
    await this.assertFinance(user.userId);
    return this.projectLedger.etatFinancier(id);
  }

  @ApiOperation({
    summary:
      'Constater un versement au porteur effectué HORS plateforme (déclaratif, aucun virement exécuté)',
  })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Versement enregistré' })
  @ApiResponse({ status: 400, description: 'Référence, date ou montant invalide' })
  @ApiResponse({ status: 403, description: 'Rôle non habilité' })
  @ApiResponse({ status: 409, description: 'Référence bancaire déjà enregistrée' })
  @Post(':id/versement-porteur')
  @HttpCode(HttpStatus.OK)
  async declarerVersement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclarerVersementPorteurDto,
    @CurrentUser() user: ActiveUser,
    @Req() request: Request,
  ) {
    const acteur = await this.assertFinance(user.userId);

    const versement = await this.projectLedger.declarerVersementPorteur({
      projetId: id,
      referenceBancaire: dto.referenceBancaire,
      dateVersement: new Date(dto.dateVersement),
      montant: dto.montant,
      commentaire: dto.commentaire ?? null,
      declareParUserId: user.userId,
    });

    // Trace métier explicite dans le journal d'audit existant, en plus de
    // l'AuditInterceptor global : la référence bancaire et le montant sont
    // les métadonnées qui comptent lors d'un contrôle.
    await this.auditLog
      .create(
        String(user.userId),
        acteur.role,
        'versement-porteur:constate',
        'projets',
        id,
        request.ip,
        request.headers?.['user-agent'],
        {
          kind: KIND_VERSEMENT_PORTEUR,
          transactionId: versement.transactionId,
          montant: versement.montant,
          referenceBancaire: versement.referenceBancaire,
          dateVersement: versement.dateVersement.toISOString(),
        },
      )
      .catch(() => {
        // L'échec du journal ne doit pas annuler un fait bancaire déjà constaté.
      });

    return {
      message:
        'Versement constaté. Aucun virement n’a été exécuté par la plateforme.',
      ...versement,
    };
  }
}

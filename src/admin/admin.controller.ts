import {
  Controller,
  Get,
  Patch,
  Query,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, ILike } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import {
  UserEntity,
  UserRole,
  UserStatus,
} from 'src/users/infrastructure/persistences/entities/user.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { SkipThrottle } from '@nestjs/throttler';

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_ROLES: string[] = rolesWithPermission('reports:read');

const ACTIVE_INVESTMENT_STATUSES = [
  InvestmentStatus.CONFIRME,
  InvestmentStatus.SIGNE,
  InvestmentStatus.PAYE,
  InvestmentStatus.REMBOURSE_CAPITAL,
  InvestmentStatus.REMBOURSE_TOTAL,
];

const MONTH_LABELS: Record<number, string> = {
  1: 'Jan', 2: 'Fév', 3: 'Mar', 4: 'Avr', 5: 'Mai', 6: 'Jun',
  7: 'Jul', 8: 'Aoû', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Déc',
};

// ─── Controller ───────────────────────────────────────────────────────────────

@SkipThrottle()
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard)
@RequirePermission('reports:read')
export class AdminController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(KycEntity)
    private readonly kycRepo: Repository<KycEntity>,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  // ─── Guard helper ──────────────────────────────────────────────────────────

  private async assertAdmin(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { userId },
      select: ['userId', 'role'],
    });
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé aux administrateurs BeOwn.');
    }
  }

  private displayName(u: UserEntity): string {
    return [u.firstname, u.lastname].filter(Boolean).join(' ') ||
      u.userEmail?.email ||
      `Utilisateur #${u.userId}`;
  }

  // ─── Users list ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Liste paginée de tous les utilisateurs (admin)' })
  @ApiResponse({ status: 200, description: 'Utilisateurs avec statut KYC et compte' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'kycStatus', required: false, type: String })
  @Get('users')
  async listUsers(
    @CurrentUser() currentUser: ActiveUser,
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
    @Query('search') search?: string,
    @Query('kycStatus') kycStatus?: string,
  ) {
    await this.assertAdmin(currentUser.userId);

    const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? '20', 10) || 20));

    const [users, total] = await this.userRepo.findAndCount({
      relations: ['userEmail'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Fetch KYC + aggregated investment totals for all returned users in parallel
    const userIds = users.map((u) => u.userId);
    const [kycRecords, investmentTotals] = await Promise.all([
      userIds.length > 0
        ? this.kycRepo.find({ where: { utilisateurId: In(userIds) } })
        : Promise.resolve([] as KycEntity[]),
      userIds.length > 0
        ? this.investRepo
            .createQueryBuilder('i')
            .select('i.utilisateurId', 'userId')
            .addSelect('COALESCE(SUM(i.montant), 0)', 'total')
            .where('i.utilisateurId IN (:...ids)', { ids: userIds })
            .andWhere('i.statut IN (:...statuts)', { statuts: ACTIVE_INVESTMENT_STATUSES })
            .groupBy('i.utilisateurId')
            .getRawMany<{ userId: number; total: string }>()
        : Promise.resolve([] as Array<{ userId: number; total: string }>),
    ]);
    const kycMap = new Map(kycRecords.map((k) => [k.utilisateurId, k]));
    const investedMap = new Map(
      investmentTotals.map((r) => [Number(r.userId), parseFloat(r.total)]),
    );

    let items = users
      .filter((u) => {
        if (!search) return true;
        const q = search.toLowerCase();
        const name = this.displayName(u).toLowerCase();
        const email = (u.userEmail?.email ?? '').toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .map((u) => {
        const kyc = kycMap.get(u.userId) ?? null;
        const { password: _p, ...safe } = u as any;
        return {
          ...safe,
          email: u.userEmail?.email ?? '',
          kycStatus: kyc?.statut ?? 'non_demarre',
          kycMotifRefus: kyc?.motifRefus ?? null,
          kycId: kyc?.id ?? null,
          totalInvested: investedMap.get(u.userId) ?? 0,
        };
      });

    // Filter by KYC status
    if (kycStatus && kycStatus !== 'all') {
      const statusMap: Record<string, string[]> = {
        validated: ['valide'],
        pending: ['non_demarre', 'en_cours', 'en_revue'],
        refused: ['refuse'],
      };
      const allowed = statusMap[kycStatus] ?? [kycStatus];
      items = items.filter((u) => allowed.includes(u.kycStatus));
    }

    return { items, total: search ? items.length : total };
  }

  // ─── Suspend / activate user ───────────────────────────────────────────────

  @ApiOperation({ summary: 'Suspendre ou réactiver un compte utilisateur' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ schema: { properties: { status: { type: 'string', enum: ['actif', 'suspendu', 'clos'] }, motif: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  @Patch('users/:id/status')
  async updateUserStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string; motif?: string },
    @CurrentUser() currentUser: ActiveUser,
  ) {
    await this.assertAdmin(currentUser.userId);
    const user = await this.userRepo.findOne({ where: { userId: id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    const previousStatus = user.status;
    await this.userRepo.update({ userId: id }, { status: body.status as UserStatus });
    if (body.status === UserStatus.SUSPENDU && previousStatus !== UserStatus.SUSPENDU) {
      this.notificationEvents.accountSuspended(id, body.motif ?? null, currentUser.userId);
    } else if (body.status === UserStatus.ACTIF && previousStatus === UserStatus.SUSPENDU) {
      this.notificationEvents.accountReactivated(id, currentUser.userId);
    } else if (body.status === UserStatus.CLOS && previousStatus !== UserStatus.CLOS) {
      this.notificationEvents.accountClosed(id, body.motif ?? null, currentUser.userId);
    }
    return { userId: id, status: body.status };
  }

  // ─── Investments by user ───────────────────────────────────────────────────

  @ApiOperation({ summary: "Historique des investissements d'un utilisateur" })
  @ApiParam({ name: 'id', description: 'userId' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Investissements paginés' })
  @Get('users/:id/investments')
  async getUserInvestments(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: ActiveUser,
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    await this.assertAdmin(currentUser.userId);

    const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? '20', 10) || 20));

    const [investments, total] = await this.investRepo.findAndCount({
      where: { utilisateurId: id },
      relations: ['projet'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalInvested = investments
      .filter((i) => ACTIVE_INVESTMENT_STATUSES.includes(i.statut))
      .reduce((sum, i) => sum + Number(i.montant), 0);

    return {
      items: investments.map((i) => ({
        id: i.id,
        projetId: i.projetId,
        projetTitre: (i as any).projet?.titre ?? '—',
        projetVille: (i as any).projet?.ville ?? '—',
        montant: Number(i.montant),
        nbTitres: i.nbTitres ?? 0,
        valeurTitre: i.valeurTitre != null ? Number(i.valeurTitre) : null,
        instrument: i.instrument,
        statut: i.statut,
        createdAt: i.createdAt,
      })),
      total,
      totalInvested,
    };
  }

  // ─── Investors of a project ────────────────────────────────────────────────

  @ApiOperation({ summary: 'Liste des investisseurs d\'un projet avec leurs fractions' })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Investisseurs paginés' })
  @Get('projects/:id/investors')
  async getProjectInvestors(
    @Param('id') projetId: string,
    @CurrentUser() currentUser: ActiveUser,
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    await this.assertAdmin(currentUser.userId);

    const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(limitParam ?? '50', 10) || 50));

    const [investments, total] = await this.investRepo.findAndCount({
      where: { projetId, statut: In(ACTIVE_INVESTMENT_STATUSES) },
      relations: ['utilisateur', 'utilisateur.userEmail'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const montantTotal = investments.reduce((sum, i) => sum + Number(i.montant), 0);
    const fractionsTotal = investments.reduce((sum, i) => sum + (i.nbTitres ?? 0), 0);

    return {
      items: investments.map((i) => {
        const u = (i as any).utilisateur as UserEntity | undefined;
        return {
          investissementId: i.id,
          userId: i.utilisateurId,
          name: u ? this.displayName(u) : `Investisseur #${i.utilisateurId}`,
          email: u?.userEmail?.email ?? '',
          montant: Number(i.montant),
          nbTitres: i.nbTitres ?? 0,
          valeurTitre: i.valeurTitre != null ? Number(i.valeurTitre) : null,
          pourcentage: montantTotal > 0
            ? parseFloat(((Number(i.montant) / montantTotal) * 100).toFixed(2))
            : 0,
          statut: i.statut,
          instrument: i.instrument,
          createdAt: i.createdAt,
        };
      }),
      total,
      montantTotal,
      fractionsTotal,
    };
  }

  // ─── Stats globales ────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Statistiques globales du tableau de bord admin' })
  @ApiResponse({ status: 200, description: 'KPIs admin' })
  @Get('stats')
  async getStats(@CurrentUser() currentUser: ActiveUser) {
    await this.assertAdmin(currentUser.userId);

    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      activeInvestors, activeInvestorsLastMonth,
      projectsEnCollecte, projectsLastMonth,
      totalCollectedRow, totalCollectedLastMonthRow,
      triRows,
    ] = await Promise.all([
      this.userRepo.count({ where: { role: UserRole.INVESTISSEUR, status: UserStatus.ACTIF } }),
      this.userRepo.createQueryBuilder('u')
        .where('u.role = :role', { role: UserRole.INVESTISSEUR })
        .andWhere('u.status = :status', { status: UserStatus.ACTIF })
        .andWhere('u.createdAt < :date', { date: firstDayThisMonth })
        .getCount(),
      this.projectRepo.count({ where: { statut: ProjectStatus.EN_COLLECTE } }),
      this.projectRepo.createQueryBuilder('p')
        .where('p.statut = :s', { s: ProjectStatus.EN_COLLECTE })
        .andWhere('p.createdAt < :date', { date: firstDayThisMonth })
        .getCount(),
      this.investRepo.createQueryBuilder('i')
        .select('COALESCE(SUM(i.montant), 0)', 'total')
        .where('i.statut IN (:...statuts)', { statuts: ACTIVE_INVESTMENT_STATUSES })
        .getRawOne<{ total: string }>(),
      this.investRepo.createQueryBuilder('i')
        .select('COALESCE(SUM(i.montant), 0)', 'total')
        .where('i.statut IN (:...statuts)', { statuts: ACTIVE_INVESTMENT_STATUSES })
        .andWhere('i.createdAt < :date', { date: firstDayThisMonth })
        .getRawOne<{ total: string }>(),
      this.projectRepo.createQueryBuilder('p')
        .select('AVG(p.triCible)', 'avg')
        .where('p.statut = :s', { s: ProjectStatus.EN_COLLECTE })
        .andWhere('p.triCible IS NOT NULL')
        .getRawOne<{ avg: string }>(),
    ]);

    const totalNow = parseFloat(totalCollectedRow?.total ?? '0');
    const totalLast = parseFloat(totalCollectedLastMonthRow?.total ?? '0');
    const collectedChange = totalLast > 0
      ? parseFloat(((totalNow - totalLast) / totalLast * 100).toFixed(1))
      : 0;

    return {
      activeInvestors,
      activeInvestorsChange: activeInvestors - activeInvestorsLastMonth,
      projectsEnCollecte,
      projectsChange: projectsEnCollecte - projectsLastMonth,
      totalCollected: totalNow,
      totalCollectedChange: collectedChange,
      avgReturn: parseFloat(parseFloat(triRows?.avg ?? '0').toFixed(1)),
      avgReturnChange: 0,
    };
  }

  // ─── Collecte mensuelle ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Collecte mensuelle (année en cours)' })
  @Get('stats/monthly')
  async getMonthly(@CurrentUser() currentUser: ActiveUser) {
    await this.assertAdmin(currentUser.userId);
    const year = new Date().getFullYear();
    const rows = await this.investRepo
      .createQueryBuilder('i')
      .select('EXTRACT(MONTH FROM i.createdAt)::int', 'month')
      .addSelect('ROUND(SUM(i.montant) / 1000000, 1)', 'collecte')
      .where('i.statut IN (:...statuts)', { statuts: ACTIVE_INVESTMENT_STATUSES })
      .andWhere('EXTRACT(YEAR FROM i.createdAt) = :year', { year })
      .groupBy('EXTRACT(MONTH FROM i.createdAt)')
      .orderBy('month', 'ASC')
      .getRawMany<{ month: number; collecte: string }>();

    const map = new Map(rows.map((r) => [Number(r.month), parseFloat(r.collecte)]));
    return Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_LABELS[i + 1],
      collecte: map.get(i + 1) ?? 0,
    }));
  }

  // ─── Par ville ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Volume investi par ville (top 10)' })
  @Get('stats/cities')
  async getCities(@CurrentUser() currentUser: ActiveUser) {
    await this.assertAdmin(currentUser.userId);
    const rows = await this.investRepo
      .createQueryBuilder('i')
      .innerJoin('i.projet', 'p')
      .select('p.ville', 'city')
      .addSelect('ROUND(SUM(i.montant) / 1000000, 1)', 'montant')
      .where('i.statut IN (:...statuts)', { statuts: ACTIVE_INVESTMENT_STATUSES })
      .andWhere('p.ville IS NOT NULL')
      .groupBy('p.ville')
      .orderBy('montant', 'DESC')
      .limit(10)
      .getRawMany<{ city: string; montant: string }>();

    return rows.map((r) => ({ city: r.city, montant: parseFloat(r.montant) }));
  }

  // ─── Activité globale de la plateforme ────────────────────────────────────

  @ApiOperation({ summary: 'Journal complet d\'activité de la plateforme (qui a fait quoi)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: ['all', 'kyc', 'investment', 'registration', 'market'] })
  @Get('activity')
  async getActivity(
    @CurrentUser() currentUser: ActiveUser,
    @Query('limit') limitParam?: string,
    @Query('type') type?: string,
  ) {
    await this.assertAdmin(currentUser.userId);

    const limit = Math.min(100, parseInt(limitParam ?? '30', 10) || 30);
    const all = !type || type === 'all';

    const tasks: Promise<any[]>[] = [];

    // KYC events
    if (all || type === 'kyc') {
      tasks.push(
        this.kycRepo
          .createQueryBuilder('k')
          .innerJoinAndSelect('k.utilisateur', 'u')
          .leftJoinAndSelect('u.userEmail', 'e')
          .orderBy('k.updatedAt', 'DESC')
          .limit(limit)
          .getMany()
          .then((rows) =>
            rows.map((k) => ({
              type: 'kyc',
              userId: k.utilisateurId,
              user: this.displayName(k.utilisateur),
              email: k.utilisateur?.userEmail?.email ?? '',
              action: this.kycActionLabel(k.statut),
              detail: k.motifRefus ?? null,
              status: this.kycActivityStatus(k.statut),
              date: k.updatedAt,
              time: this.relativeTime(k.updatedAt),
            })),
          ),
      );
    }

    // Investment events
    if (all || type === 'investment') {
      tasks.push(
        this.investRepo
          .createQueryBuilder('i')
          .innerJoinAndSelect('i.utilisateur', 'u')
          .leftJoinAndSelect('u.userEmail', 'e')
          .innerJoinAndSelect('i.projet', 'p')
          .orderBy('i.createdAt', 'DESC')
          .limit(limit)
          .getMany()
          .then((rows) =>
            rows.map((i) => ({
              type: 'investment',
              userId: i.utilisateurId,
              user: this.displayName(i.utilisateur),
              email: i.utilisateur?.userEmail?.email ?? '',
              action: `Investissement — ${(i as any).projet?.titre ?? i.projetId}`,
              detail: `${Number(i.montant).toLocaleString('fr-FR')} FCFA · ${i.nbTitres ?? 0} titre(s)`,
              status: ACTIVE_INVESTMENT_STATUSES.includes(i.statut) ? 'success' : 'pending',
              date: i.createdAt,
              time: this.relativeTime(i.createdAt),
            })),
          ),
      );
    }

    // User registrations
    if (all || type === 'registration') {
      tasks.push(
        this.userRepo
          .createQueryBuilder('u')
          .leftJoinAndSelect('u.userEmail', 'e')
          .orderBy('u.createdAt', 'DESC')
          .limit(limit)
          .getMany()
          .then((rows) =>
            rows.map((u) => ({
              type: 'registration',
              userId: u.userId,
              user: this.displayName(u),
              email: u.userEmail?.email ?? '',
              action: 'Inscription sur la plateforme',
              detail: u.role,
              status: u.status === UserStatus.ACTIF ? 'success' : 'pending',
              date: u.createdAt,
              time: this.relativeTime(u.createdAt),
            })),
          ),
      );
    }

    // Secondary market orders
    if (all || type === 'market') {
      tasks.push(
        this.ordreRepo
          .createQueryBuilder('o')
          .innerJoinAndSelect('o.vendeur', 'v')
          .leftJoinAndSelect('v.userEmail', 'e')
          .orderBy('o.createdAt', 'DESC')
          .limit(limit)
          .getMany()
          .then((rows) =>
            rows.map((o) => ({
              type: 'market',
              userId: o.vendeurId,
              user: this.displayName(o.vendeur),
              email: o.vendeur?.userEmail?.email ?? '',
              action: `Ordre marché secondaire — ${o.sens}`,
              detail: `${Number(o.montant).toLocaleString('fr-FR')} titres · ${Number(o.prixUnitaire).toLocaleString('fr-FR')} FCFA/u`,
              status: o.statut === OrdreMarcheStatus.EXECUTE ? 'success' : o.statut === OrdreMarcheStatus.ANNULE ? 'error' : 'pending',
              date: o.createdAt,
              time: this.relativeTime(o.createdAt),
            })),
          ),
      );
    }

    const results = await Promise.all(tasks);
    return results
      .flat()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit)
      .map(({ date: _, ...rest }) => rest);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private kycActionLabel(statut: string): string {
    const labels: Record<string, string> = {
      non_demarre: 'KYC initialisé',
      en_cours: 'KYC en cours de saisie',
      en_revue: 'KYC soumis — en revue',
      valide: 'KYC validé ✓',
      refuse: 'KYC refusé',
      expire: 'KYC expiré',
    };
    return labels[statut] ?? `KYC ${statut}`;
  }

  private kycActivityStatus(statut: string): 'success' | 'error' | 'pending' {
    if (statut === 'valide') return 'success';
    if (statut === 'refuse') return 'error';
    return 'pending';
  }

  private relativeTime(date: Date): string {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `Il y a ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Il y a ${hours}h`;
    return `Il y a ${Math.floor(hours / 24)}j`;
  }
}

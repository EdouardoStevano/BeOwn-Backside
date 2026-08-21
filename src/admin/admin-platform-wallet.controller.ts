import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { rolesWithPermission } from 'src/iam/domain/policies/role-permissions.policy';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { WalletType, TransactionStatus } from 'src/wallets/domains/enums/wallet.enum';

const ADMIN_ROLES: string[] = rolesWithPermission('platform:wallet');

/**
 * Sources canoniques créditant le wallet FRAIS_PLATEFORME, telles qu'elles
 * sont réellement écrites dans `metadata.source` par le code :
 *  - `plateforme_annuel`   → execute-distribution.usecase (frais de gestion annuels)
 *  - `gestion_locative`    → execute-distribution.usecase (frais sur loyers)
 *  - `gain_vente_bien`     → execute-sortie.usecase (performance fee sur plus-value)
 *  - `revente_transaction` → yousign-webhook / admin-secondary-market (frais de transaction)
 *  - `gain_revente_actions`→ yousign-webhook / admin-secondary-market (frais sur plus-value revente)
 * Clé → libellé FR. Sert à 0-remplir les cards « Par source » même sans mouvement.
 */
const PLATFORM_FEE_SOURCES: Record<string, string> = {
  plateforme_annuel: 'Frais de gestion annuels',
  gestion_locative: 'Frais de gestion locative',
  gain_vente_bien: 'Commission sur plus-value (vente du bien)',
  revente_transaction: 'Frais de transaction (marché secondaire)',
  gain_revente_actions: 'Commission sur plus-value (revente de parts)',
};

@ApiTags('Admin — Portefeuille plateforme')
@ApiBearerAuth()
@Controller('admin/platform-wallet')
@UseGuards(JwtAuthGuard)
@RequirePermission('platform:wallet')
export class AdminPlatformWalletController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projetRepo: Repository<ProjectEntity>,
  ) {}

  private async assertAdmin(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  /**
   * Fusionne les totaux agrégés en base avec la liste canonique :
   * une entrée par source canonique (0 si absente), puis les éventuelles
   * sources hors-liste présentes en base (triées, canoniques d'abord).
   */
  private mergeBySource(
    rows: { source: string; total: string }[],
  ): { source: string; total: number }[] {
    const found = new Map(rows.map((r) => [r.source, Number(r.total)]));
    const canonical = Object.keys(PLATFORM_FEE_SOURCES).map((source) => ({
      source,
      total: found.get(source) ?? 0,
    }));
    const extras = rows
      .filter((r) => !(r.source in PLATFORM_FEE_SOURCES))
      .map((r) => ({ source: r.source, total: Number(r.total) }));
    return [...canonical, ...extras];
  }

  @ApiOperation({ summary: 'Commissions collectées par la plateforme (super_admin)' })
  @Get()
  async getPlatformWallet(@CurrentUser() admin: ActiveUser) {
    await this.assertAdmin(admin.userId);

    const wallet = await this.walletRepo.findOne({
      where: { type: WalletType.FRAIS_PLATEFORME },
    });
    if (!wallet) {
      return {
        solde: 0,
        devise: 'EUR',
        bySource: this.mergeBySource([]),
        monthly: [],
        activity: [],
      };
    }

    const base = () =>
      this.txRepo
        .createQueryBuilder('tx')
        .where('tx.walletDestination = :id', { id: wallet.id })
        .andWhere('tx.statut = :statut', { statut: TransactionStatus.REUSSI });

    const bySource = await base()
      .select("COALESCE(tx.metadata->>'source', tx.type)", 'source')
      .addSelect('SUM(tx.montant)', 'total')
      .groupBy("COALESCE(tx.metadata->>'source', tx.type)")
      .getRawMany<{ source: string; total: string }>();

    const monthly = await base()
      .select("TO_CHAR(DATE_TRUNC('month', tx.createdAt), 'YYYY-MM')", 'month')
      .addSelect('SUM(tx.montant)', 'total')
      .andWhere("tx.createdAt >= NOW() - INTERVAL '12 months'")
      .groupBy("TO_CHAR(DATE_TRUNC('month', tx.createdAt), 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany<{ month: string; total: string }>();

    // 50 derniers mouvements réussis crédités au wallet frais plateforme.
    const rows = await this.txRepo.find({
      where: {
        walletDestination: wallet.id,
        statut: TransactionStatus.REUSSI,
      },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    // Résolution de la contrepartie (« de qui ») en batch (pas de N+1) :
    // via l'investissement lié (→ investisseur), sinon via le projet lié.
    const investIds = [
      ...new Set(rows.map((r) => r.investissementId).filter((v): v is string => !!v)),
    ];
    const investments = investIds.length
      ? await this.investRepo.find({ where: { id: In(investIds) } })
      : [];
    const investById = new Map(investments.map((i) => [i.id, i]));

    const projetIds = [
      ...new Set(
        [
          ...rows.map((r) => r.projetId),
          ...investments.map((i) => i.projetId),
        ].filter((v): v is string => !!v),
      ),
    ];
    const projets = projetIds.length
      ? await this.projetRepo.find({ where: { id: In(projetIds) } })
      : [];
    const projetTitreById = new Map(projets.map((p) => [p.id, p.titre]));

    const userIds = [
      ...new Set(
        investments
          .map((i) => i.utilisateurId)
          .filter((v): v is number => v != null),
      ),
    ];
    const users = userIds.length
      ? await this.userRepo.find({ where: { userId: In(userIds) } })
      : [];
    const userNameById = new Map(
      users.map((u) => [
        u.userId,
        [u.firstname, u.lastname].filter(Boolean).join(' ').trim() ||
          `#${u.userId}`,
      ]),
    );

    const resolveContrepartie = (r: TransactionEntity): string | null => {
      if (r.investissementId) {
        const inv = investById.get(r.investissementId);
        if (inv) {
          const name = userNameById.get(inv.utilisateurId);
          if (name) return name;
          const titre = projetTitreById.get(inv.projetId);
          if (titre) return titre;
        }
      }
      if (r.projetId) {
        const titre = projetTitreById.get(r.projetId);
        if (titre) return titre;
      }
      return null;
    };

    const activity = rows.map((r) => ({
      id: r.id,
      date: r.createdAt,
      montant: Number(r.montant),
      source: (r.metadata?.source as string | undefined) ?? r.type,
      type: r.type,
      projetId: r.projetId ?? null,
      contrepartie: resolveContrepartie(r),
      reference: r.idempotencyKey ?? null,
    }));

    return {
      solde: Number(wallet.solde),
      devise: wallet.devise ?? 'EUR',
      bySource: this.mergeBySource(bySource),
      monthly: monthly.map((r) => ({ month: r.month, total: Number(r.total) })),
      activity,
    };
  }
}

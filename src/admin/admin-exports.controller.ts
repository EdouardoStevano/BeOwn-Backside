import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { Response } from 'express';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';
import { BOM_UTF8, ligneCsv } from './csv-stream.util';

const ROLES_EXPORT: string[] = rolesWithPermission('data:export');

/**
 * Taille des pages lues en flux. Chaque page part sur la socket avant que la
 * suivante ne soit lue : la mémoire du processus porte AU PLUS une page, quel
 * que soit le volume exporté — jamais de `find()` intégral en mémoire.
 */
const TAILLE_PAGE = 500;

/** Regex UUID v1-5 — filtre `projetId` validé avant d'atteindre la requête. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Exports CSV du back-office — comptabilité, contrôle, réponse au régulateur.
 *
 * STREAMING OBLIGATOIRE : ces tables ne font que grossir et un export intégral
 * chargé en mémoire finit par tuer le processus le jour où l'on en a le plus
 * besoin (une clôture comptable, une demande AMF). La pagination est en KEYSET
 * (`id > dernier id vu`, ordre stable sur la clé primaire) et non en
 * OFFSET/LIMIT : l'offset relit et jette toutes les pages précédentes à chaque
 * page — quadratique sur la table entière — et se décale si des lignes
 * s'insèrent pendant l'export.
 *
 * PERMISSION `data:export`, doublée d'une relecture du rôle EN BASE : ces
 * fichiers concentrent des données personnelles et financières, un jeton
 * antérieur à une révocation ne doit pas suffire.
 */
@ApiTags('Admin — Exports CSV')
@ApiBearerAuth()
@Controller('admin/exports')
@UseGuards(JwtAuthGuard)
@RequirePermission('data:export')
export class AdminExportsController {
  private readonly logger = new Logger(AdminExportsController.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(KycEntity)
    private readonly kycRepo: Repository<KycEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investmentRepo: Repository<InvestmentEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  /** Défense en profondeur : le rôle est relu EN BASE, pas seulement dans le jeton. */
  private async assertExport(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ROLES_EXPORT.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  /** Entêtes HTTP d'un export : CSV UTF-8 téléchargé, jamais mis en cache. */
  private ouvrirCsv(res: Response, nomFichier: string, entetes: string[]): void {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.write(BOM_UTF8);
    res.write(ligneCsv(entetes));
  }

  /** Trace structurée d'un export — qui, quoi, combien, en combien de temps. */
  private tracerExport(
    exportNom: string,
    adminUserId: number,
    lignes: number,
    debutMs: number,
    filtres: Record<string, unknown> = {},
  ): void {
    this.logger.log(
      JSON.stringify({
        evt: 'admin_export_csv',
        export: exportNom,
        adminUserId,
        lignes,
        dureeMs: Date.now() - debutMs,
        ...filtres,
      }),
    );
  }

  @ApiOperation({
    summary: 'Export CSV du grand livre des transactions (streaming)',
  })
  @ApiQuery({ name: 'from', required: false, description: 'Date ISO incluse (createdAt >= from)' })
  @ApiQuery({ name: 'to', required: false, description: 'Date ISO incluse (createdAt <= to)' })
  @Get('transactions.csv')
  async transactions(
    @CurrentUser() admin: ActiveUser,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    await this.assertExport(admin.userId);

    // Bornes validées AVANT d'écrire le moindre entête : une 400 doit rester
    // une vraie 400, pas un CSV tronqué.
    const dateFrom = this.parseDate(from, 'from');
    const dateTo = this.parseDate(to, 'to');

    const debut = Date.now();
    this.ouvrirCsv(res, 'transactions.csv', [
      'id',
      'date',
      'type',
      'statut',
      'montant',
      'devise',
      'walletSourceType',
      'walletDestType',
      'userIdProprietaire',
      'referenceStripe',
    ]);

    let lignes = 0;
    let curseur: string | null = null;
    for (;;) {
      const qb = this.txRepo
        .createQueryBuilder('t')
        // Le type des portefeuilles et leur titulaire viennent de la jointure :
        // une résolution ligne à ligne serait un N+1 sur la table la plus grosse.
        .leftJoin(WalletEntity, 'ws', 'ws.id = t.walletSource')
        .leftJoin(WalletEntity, 'wd', 'wd.id = t.walletDestination')
        .select('t.id', 'id')
        .addSelect('t.createdAt', 'date')
        .addSelect('t.type', 'type')
        .addSelect('t.statut', 'statut')
        .addSelect('t.montant', 'montant')
        .addSelect('t.devise', 'devise')
        .addSelect('ws.type', 'walletSourceType')
        .addSelect('wd.type', 'walletDestType')
        // Le titulaire « humain » du mouvement : côté débité d'abord, sinon
        // côté crédité (dépôt). Les wallets système n'ont pas de titulaire.
        .addSelect(
          'COALESCE(ws."proprietaireUserId", wd."proprietaireUserId")',
          'userIdProprietaire',
        )
        .addSelect('t.fournisseurRef', 'referenceStripe')
        .orderBy('t.id', 'ASC')
        .limit(TAILLE_PAGE);
      if (dateFrom) qb.andWhere('t.createdAt >= :dateFrom', { dateFrom });
      if (dateTo) qb.andWhere('t.createdAt <= :dateTo', { dateTo });
      if (curseur) qb.andWhere('t.id > :curseur', { curseur });

      const page = await qb.getRawMany();
      if (page.length === 0) break;

      res.write(
        page
          .map((r) =>
            ligneCsv([
              r.id,
              r.date,
              r.type,
              r.statut,
              r.montant,
              r.devise,
              r.walletSourceType,
              r.walletDestType,
              r.userIdProprietaire,
              r.referenceStripe,
            ]),
          )
          .join(''),
      );
      lignes += page.length;
      curseur = page[page.length - 1].id;
      if (page.length < TAILLE_PAGE) break;
    }

    res.end();
    this.tracerExport('transactions', admin.userId, lignes, debut, {
      from: from ?? null,
      to: to ?? null,
    });
  }

  @ApiOperation({ summary: 'Export CSV des investissements (streaming)' })
  @ApiQuery({ name: 'projetId', required: false, description: 'UUID du projet' })
  @Get('investissements.csv')
  async investissements(
    @CurrentUser() admin: ActiveUser,
    @Res() res: Response,
    @Query('projetId') projetId?: string,
  ): Promise<void> {
    await this.assertExport(admin.userId);
    if (projetId !== undefined && !UUID.test(projetId)) {
      throw new BadRequestException('projetId doit être un UUID.');
    }

    const debut = Date.now();
    this.ouvrirCsv(res, 'investissements.csv', [
      'id',
      'date',
      'projetId',
      'titreProjet',
      'utilisateurId',
      'nbFractions',
      'montant',
      'statut',
    ]);

    let lignes = 0;
    let curseur: string | null = null;
    for (;;) {
      const qb = this.investmentRepo
        .createQueryBuilder('i')
        .leftJoin(ProjectEntity, 'p', 'p.id = i.projetId')
        .select('i.id', 'id')
        .addSelect('i.createdAt', 'date')
        .addSelect('i.projetId', 'projetId')
        .addSelect('p.titre', 'titreProjet')
        .addSelect('i.utilisateurId', 'utilisateurId')
        .addSelect('i.nbTitres', 'nbFractions')
        .addSelect('i.montant', 'montant')
        .addSelect('i.statut', 'statut')
        .orderBy('i.id', 'ASC')
        .limit(TAILLE_PAGE);
      if (projetId) qb.andWhere('i.projetId = :projetId', { projetId });
      if (curseur) qb.andWhere('i.id > :curseur', { curseur });

      const page = await qb.getRawMany();
      if (page.length === 0) break;

      res.write(
        page
          .map((r) =>
            ligneCsv([
              r.id,
              r.date,
              r.projetId,
              r.titreProjet,
              r.utilisateurId,
              r.nbFractions,
              r.montant,
              r.statut,
            ]),
          )
          .join(''),
      );
      lignes += page.length;
      curseur = page[page.length - 1].id;
      if (page.length < TAILLE_PAGE) break;
    }

    res.end();
    this.tracerExport('investissements', admin.userId, lignes, debut, {
      projetId: projetId ?? null,
    });
  }

  @ApiOperation({ summary: 'Export CSV des investisseurs (streaming)' })
  @Get('investisseurs.csv')
  async investisseurs(
    @CurrentUser() admin: ActiveUser,
    @Res() res: Response,
  ): Promise<void> {
    await this.assertExport(admin.userId);

    const debut = Date.now();
    this.ouvrirCsv(res, 'investisseurs.csv', [
      'userId',
      'email',
      'nom',
      'prenom',
      'kycStatut',
      'dateInscription',
      'totalInvesti',
    ]);

    let lignes = 0;
    let curseur = 0;
    for (;;) {
      const page: Array<{
        userId: number;
        email: string | null;
        nom: string | null;
        prenom: string | null;
        dateInscription: Date;
      }> = await this.userRepo
        .createQueryBuilder('u')
        .leftJoin('u.userEmail', 'e')
        .select('u.userId', 'userId')
        .addSelect('e.email', 'email')
        .addSelect('u.lastname', 'nom')
        .addSelect('u.firstname', 'prenom')
        .addSelect('u.createdAt', 'dateInscription')
        .where('u.userId > :curseur', { curseur })
        .orderBy('u.userId', 'ASC')
        .limit(TAILLE_PAGE)
        .getRawMany();
      if (page.length === 0) break;

      // KYC et total investi résolus EN LOT pour la page courante : deux
      // requêtes par page, jamais deux par investisseur.
      const userIds = page.map((u) => Number(u.userId));
      const [kycs, totaux] = await Promise.all([
        this.kycRepo.find({
          where: { utilisateurId: In(userIds) },
          select: ['utilisateurId', 'statut'],
        }),
        this.investmentRepo
          .createQueryBuilder('i')
          .select('i.utilisateurId', 'utilisateurId')
          .addSelect('COALESCE(SUM(i.montant), 0)', 'total')
          .where('i.utilisateurId IN (:...userIds)', { userIds })
          // Même périmètre que le décompte des fractions vendues : une
          // rétractation ou une annulation n'est pas un investissement.
          .andWhere('i.statut NOT IN (:...exclus)', {
            exclus: [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE],
          })
          .groupBy('i.utilisateurId')
          .getRawMany(),
      ]);
      const kycParUser = new Map(kycs.map((k) => [Number(k.utilisateurId), k.statut]));
      const totalParUser = new Map(
        totaux.map((t: any) => [Number(t.utilisateurId), Number(t.total)]),
      );

      res.write(
        page
          .map((u) =>
            ligneCsv([
              u.userId,
              u.email,
              u.nom,
              u.prenom,
              kycParUser.get(Number(u.userId)) ?? KycStatus.NON_DEMARRE,
              u.dateInscription,
              (totalParUser.get(Number(u.userId)) ?? 0).toFixed(2),
            ]),
          )
          .join(''),
      );
      lignes += page.length;
      curseur = Number(page[page.length - 1].userId);
      if (page.length < TAILLE_PAGE) break;
    }

    res.end();
    this.tracerExport('investisseurs', admin.userId, lignes, debut);
  }

  /** Parse une borne de date optionnelle — 400 explicite si illisible. */
  private parseDate(valeur: string | undefined, nom: string): Date | undefined {
    if (valeur === undefined || valeur === '') return undefined;
    const date = new Date(valeur);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${nom} doit être une date ISO valide.`);
    }
    return date;
  }
}

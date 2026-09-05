import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole, UserStatus, UserType } from 'src/iam/domains/enums/user.enum';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { SpvEntity } from 'src/projects/infrastructure/persistences/entities/spv.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import {
  ProjectStatus,
  ProjectType,
  ProjectInstrument,
} from 'src/projects/domains/enums/project-status.enum';
import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import { SortieProjetEntity } from 'src/projects/infrastructure/persistences/entities/sortie-projet.entity';
import { StatutSortie } from 'src/projects/domains/sortie-projet';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import {
  WalletType,
  TransactionType,
  TransactionStatus,
  TransactionFournisseur,
} from 'src/wallets/domains/enums/wallet.enum';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { KIND_VERSEMENT_PORTEUR } from 'src/wallets/applications/project-ledger.service';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import {
  EcheanceStatus,
  InvestmentStatus,
} from 'src/investments/domains/enums/investment-status.enum';
import { ReservationEntity } from 'src/reservations/infrastructure/persistences/entities/reservation.entity';
import { ReservationStatus } from 'src/reservations/domains/enums/reservation-status.enum';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { ProfilPMEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pm.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import {
  KycStatus,
  KycNiveau,
  CategorieInvestisseur,
} from 'src/profiles/domains/enums/kyc-status.enum';
import { QuestionnaireAdequationEntity } from 'src/profiles/infrastructure/persistences/entities/questionnaire-adequation.entity';
import {
  NotificationEntity,
  NotificationCanal,
  NotificationType,
} from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { AuditLogEntity } from 'src/notifications/infrastructure/persistences/entities/audit-log.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import {
  OrdreMarcheSens,
  OrdreMarcheStatus,
} from 'src/secondarymarket/domains/ordre-marche';
import { AvisEntity } from 'src/avis/infrastructure/persistences/entities/avis.entity';
import { UniteLouableEntity } from 'src/locative-management/infrastructure/persistences/entities/unite-louable.entity';
import { LocataireEntity } from 'src/locative-management/infrastructure/persistences/entities/locataire.entity';
import { BailEntity } from 'src/locative-management/infrastructure/persistences/entities/bail.entity';
import { LoyerEncaisseEntity } from 'src/locative-management/infrastructure/persistences/entities/loyer-encaisse.entity';
import { ChargeEntity } from 'src/locative-management/infrastructure/persistences/entities/charge.entity';
import { StatutBail } from 'src/locative-management/domains/enums/statut-bail.enum';
import { StatutDeclaration } from 'src/locative-management/domains/enums/statut-declaration.enum';
import { TypeCharge } from 'src/locative-management/domains/enums/type-charge.enum';
import { PeriodeDistributionEntity } from 'src/distributions/infrastructure/persistences/entities/periode-distribution.entity';
import { DistributionPartEntity } from 'src/distributions/infrastructure/persistences/entities/distribution-part.entity';
import { StatutPeriodeDistribution } from 'src/distributions/domains/enums/statut-periode-distribution.enum';
import { ReclamationEntity } from 'src/reclamations/infrastructure/persistences/entities/reclamation.entity';
import {
  CategorieReclamation,
  StatutReclamation,
  echeanceReponse,
  genererReference,
} from 'src/reclamations/domains/reclamation';
import { NewsEntity, NewsStatus } from 'src/news/news.entity';
import { DemandeAccesPorteurEntity } from 'src/porteur-access/infrastructure/persistences/entities/demande-acces-porteur.entity';
import { StatutDemandeAccesPorteur } from 'src/porteur-access/domains/demande-acces-porteur';
import { CGU_VERSION_COURANTE } from 'src/porteur-access/domains/cgu-version';
import { DEFAULT_FEE_RATES } from 'src/common/platform-fees/platform-fees.service';
import { EffetMouvement, LivreSeed } from './seed-ledger';
import { ACTUALITES, ficiComplet, ficiPartiel } from './seed-fixtures';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  DATAFAKE BeOwn — jeu de données scénarisé pour testeurs réels
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  22 utilisateurs :
 *    • 1 SUPER_ADMIN + 4 rôles métier + 6 rôles complémentaires (compliance,
 *      financier, support, dpo, rcci, cgp — auparavant clonés en SQL hors seed)
 *    • 3 PORTEURS   — porteur3 est réunionnais (marché cible La Réunion/France)
 *    • 8 INVESTISSEURS — KYC validé (×3), non démarré, refusé, en revue ;
 *      investisseur6 est une personne morale ; investisseur7 a une demande
 *      d'accès porteur SOUMISE ; investisseur8 a le DOUBLE ACCÈS (rôle
 *      investisseur + `porteurAccess`, demande acceptée à l'appui)
 *
 *  7 projets couvrant tout le cycle de vie :
 *    A  Résidence Les Jardins (Dakar)   EN_EXPLOITATION — 3 distributions versées
 *    B  Villas Cocody (Abidjan)         BROUILLON — document d'infos clés incomplet
 *    C  Bureaux Plateau (Abidjan)       EN_COLLECTE — obligataire, échéancier généré
 *    D  Résidence Océane (Saint-Denis)  ANNONCE — pré-investissement + réservations
 *    E  Cœur de Ville (Saint-Pierre)    EN_COLLECTE — partiellement financé + délai
 *    F  Les Filaos (L'Étang-Salé)       ECHEC — collecte remboursée intégralement
 *    G  Les Flamboyants (Le Tampon)     FINANCE — exploitation porteur3, loyers
 *       déclarés, versement porteur historisé, prêt pour dérouler une
 *       distribution réelle de bout en bout (calcul → validation → exécution)
 *
 *  GRAND LIVRE — chaque écriture insérée passe par `LivreSeed` (module pur,
 *  testé dans seed-ledger.spec.ts) : les soldes des wallets sont POSÉS depuis
 *  ce livre à la fin du seed, puis `rapprocherGrandLivre` est rejoué — un
 *  écart non nul fait échouer le seed. Les wallets `sequestre_ir`,
 *  `sequestre_csg` et `frais_plateforme` existent avec du solde (IR 12,8 %,
 *  CSG 17,2 % et frais plateforme non nuls sur chaque période distribuée).
 *
 *  Le seed TRONQUE les tables avant insertion → exécution idempotente.
 *  Lancement : `npm run seed`.
 * ════════════════════════════════════════════════════════════════════════════
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

const TAUX_IR = 0.128; // parité CalculateDistributionPeriodeUseCase
const TAUX_CSG = 0.172;

interface CompteInvestisseur {
  user: UserEntity;
  wallet: WalletEntity | null;
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  // Mots de passe (hachés bcrypt 12). L'admin a un secret distinct et renforcé.
  private readonly ADMIN_PASSWORD = 'Admin@BeOwn#2026!Secure';
  private readonly PORTEUR_PASSWORD = 'Porteur@2026!';
  private readonly INVESTISSEUR_PASSWORD = 'Investisseur@2026!';

  /**
   * Grand livre en mémoire du jeu de données : toutes les écritures passent
   * par lui, les soldes finaux en sont dérivés. Réinitialisé à chaque run.
   */
  private livre!: LivreSeed;

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserEmailEntity)
    private readonly emailRepo: Repository<UserEmailEntity>,
    @InjectRepository(ProfilPPEntity)
    private readonly profilPPRepo: Repository<ProfilPPEntity>,
    @InjectRepository(ProfilPMEntity)
    private readonly profilPMRepo: Repository<ProfilPMEntity>,
    @InjectRepository(KycEntity)
    private readonly kycRepo: Repository<KycEntity>,
    @InjectRepository(QuestionnaireAdequationEntity)
    private readonly questionnaireRepo: Repository<QuestionnaireAdequationEntity>,
    @InjectRepository(SpvEntity)
    private readonly spvRepo: Repository<SpvEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SortieProjetEntity)
    private readonly sortieRepo: Repository<SortieProjetEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investmentRepo: Repository<InvestmentEntity>,
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
    @InjectRepository(ReservationEntity)
    private readonly reservationRepo: Repository<ReservationEntity>,
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(AvisEntity)
    private readonly avisRepo: Repository<AvisEntity>,
    @InjectRepository(UniteLouableEntity)
    private readonly uniteRepo: Repository<UniteLouableEntity>,
    @InjectRepository(LocataireEntity)
    private readonly locataireRepo: Repository<LocataireEntity>,
    @InjectRepository(BailEntity)
    private readonly bailRepo: Repository<BailEntity>,
    @InjectRepository(LoyerEncaisseEntity)
    private readonly loyerRepo: Repository<LoyerEncaisseEntity>,
    @InjectRepository(ChargeEntity)
    private readonly chargeRepo: Repository<ChargeEntity>,
    @InjectRepository(PeriodeDistributionEntity)
    private readonly periodeRepo: Repository<PeriodeDistributionEntity>,
    @InjectRepository(DistributionPartEntity)
    private readonly distributionPartRepo: Repository<DistributionPartEntity>,
    @InjectRepository(ReclamationEntity)
    private readonly reclamationRepo: Repository<ReclamationEntity>,
    @InjectRepository(NewsEntity)
    private readonly newsRepo: Repository<NewsEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepo: Repository<AuditLogEntity>,
    @InjectRepository(DemandeAccesPorteurEntity)
    private readonly demandeAccesPorteurRepo: Repository<DemandeAccesPorteurEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private daysAgo(n: number): Date {
    return new Date(Date.now() - n * 86_400_000);
  }

  private daysAhead(n: number): Date {
    return new Date(Date.now() + n * 86_400_000);
  }

  /** Renvoie 'YYYY-MM' du mois courant décalé de `monthOffset` (négatif = passé). */
  private periode(monthOffset = 0): string {
    const d = new Date();
    const x = new Date(d.getFullYear(), d.getMonth() + monthOffset, 1);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
  }

  private async audit(
    actor: UserEntity,
    action: string,
    objetType: string,
    objetId: string,
    quand?: Date,
  ): Promise<void> {
    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        acteurId: String(actor.userId),
        role: actor.role,
        action,
        objetType,
        objetId,
        ip: '196.0.0.1',
        userAgent: 'BeOwn-Seed/2.0',
        metadata: { userId: actor.userId },
        ...(quand ? { createdAt: quand } : {}),
      }),
    );
  }

  /** Notification in-app réaliste (celle que lit l'écran cloche/notifications). */
  private async notifier(
    userId: number,
    type: NotificationType,
    titre: string,
    message: string,
    metadata: Record<string, unknown> = {},
    options: { lu?: boolean; ageJours?: number } = {},
  ): Promise<void> {
    const quand = this.daysAgo(options.ageJours ?? 0);
    await this.notificationRepo.save(
      this.notificationRepo.create({
        utilisateurId: userId,
        canal: NotificationCanal.IN_APP,
        type,
        titre,
        message,
        lu: options.lu ?? false,
        statut: 'delivre',
        envoyeLe: quand,
        metadata,
        createdAt: quand,
      }),
    );
  }

  /**
   * Écriture du grand livre : enregistrée dans `LivreSeed` (qui tient les
   * positions et le registre du rapprochement) PUIS persistée. Aucun solde de
   * wallet n'est jamais posé ailleurs que depuis ce livre.
   */
  private async tx(e: {
    source: WalletEntity | null;
    destination: WalletEntity | null;
    montant: number;
    type: TransactionType;
    statut?: TransactionStatus;
    fournisseur?: TransactionFournisseur;
    effet?: EffetMouvement;
    idempotencyKey?: string;
    fournisseurRef?: string;
    referenceExterne?: string;
    investissementId?: string;
    projetId?: string;
    metadata?: Record<string, unknown>;
    motifEchec?: string;
    fraisPlateforme?: number;
    ageJours?: number;
  }): Promise<TransactionEntity> {
    const statut = e.statut ?? TransactionStatus.REUSSI;
    this.livre.enregistrer({
      source: e.source?.id ?? null,
      destination: e.destination?.id ?? null,
      montant: e.montant,
      statut,
      effet: e.effet,
    });
    return this.transactionRepo.save(
      this.transactionRepo.create({
        walletSource: e.source?.id ?? null,
        walletDestination: e.destination?.id ?? null,
        montant: e.montant,
        devise: 'EUR',
        type: e.type,
        statut,
        fournisseur: e.fournisseur ?? TransactionFournisseur.INTERNE,
        fournisseurRef: e.fournisseurRef ?? null,
        referenceExterne: e.referenceExterne ?? null,
        idempotencyKey: e.idempotencyKey ?? null,
        investissementId: e.investissementId ?? null,
        projetId: e.projetId ?? null,
        metadata: e.metadata ?? null,
        motifEchec: e.motifEchec ?? null,
        fraisPsp: 0,
        fraisPlateforme: e.fraisPlateforme ?? 0,
        ...(e.ageJours !== undefined
          ? { createdAt: this.daysAgo(e.ageJours) }
          : {}),
      }),
    );
  }

  /**
   * Souscription primaire d'un investisseur, dans la forme exacte de
   * `CreateInvestmentUseCase` :
   *  - AVERTI → engagement définitif immédiat : SOUSCRIPTION wallet
   *    investisseur → wallet projet (clé `invest:<userId>:<invId>`) ;
   *  - NON AVERTI → ESCROW_LOCK intra-wallet (disponible → bloqué) puis, si le
   *    délai de réflexion est expiré, ESCROW_RELEASE vers le wallet projet
   *    (clé `retract-release:<invId>`, parité ConfirmRetractationCronService).
   *
   * Retourne l'investissement persisté (avec sa signature SIGNED).
   */
  private async souscrire(args: {
    projet: ProjectEntity;
    walletProjet: WalletEntity;
    investisseur: CompteInvestisseur;
    nbTitres: number;
    valeurTitre: number;
    statutFinal:
      | InvestmentStatus.CONFIRME
      | InvestmentStatus.EN_DELAI_RETRACTATION;
    averti: boolean;
    /** Jour de la souscription (lock/signature). */
    jourSouscription: number;
    /** Jour de la confirmation (release) — ignoré si EN_DELAI_RETRACTATION. */
    jourConfirmation?: number;
    /** Fin du délai de réflexion, pour un engagement encore réversible. */
    delaiJusquAu?: Date;
  }): Promise<InvestmentEntity> {
    const montant = round2(args.nbTitres * args.valeurTitre);
    const signatureId = crypto.randomUUID();
    const quandSouscription = this.daysAgo(args.jourSouscription);

    const investment = await this.investmentRepo.save(
      this.investmentRepo.create({
        projetId: args.projet.id,
        utilisateurId: args.investisseur.user.userId,
        montant,
        instrument: args.projet.instrument,
        nbTitres: args.nbTitres,
        valeurTitre: args.valeurTitre,
        statut: args.statutFinal,
        delaiRetractationJusquAu:
          args.delaiJusquAu ??
          (args.averti ? null : this.daysAgo(args.jourConfirmation ?? 0)),
        bulletinDocId: crypto.randomUUID(),
        signatureId,
        createdAt: quandSouscription,
      }),
    );

    await this.signatureRepo.save(
      this.signatureRepo.create({
        id: signatureId,
        youSignRequestId: `ysr_${crypto.randomUUID().slice(0, 12)}`,
        youSignSignerId: `yss_${crypto.randomUUID().slice(0, 12)}`,
        youSignSigningUrl: null,
        documentId: investment.bulletinDocId ?? crypto.randomUUID(),
        investmentId: investment.id,
        ordreId: null,
        nbFractions: args.nbTitres,
        userId: args.investisseur.user.userId,
        statut: SignatureStatus.SIGNED,
        expiresAt: new Date(quandSouscription.getTime() + 14 * 86_400_000),
        signedAt: quandSouscription,
        createdAt: quandSouscription,
      } as Partial<SignatureEntity>),
    );

    const wallet = args.investisseur.wallet!;
    if (args.averti) {
      // Engagement définitif immédiat : les fonds sont acquis au projet.
      await this.tx({
        source: wallet,
        destination: args.walletProjet,
        montant,
        type: TransactionType.SOUSCRIPTION,
        idempotencyKey: `invest:${args.investisseur.user.userId}:${investment.id}`,
        investissementId: investment.id,
        projetId: args.projet.id,
        ageJours: args.jourSouscription,
      });
    } else {
      // Délai de réflexion : blocage intra-wallet à la souscription…
      await this.tx({
        source: wallet,
        destination: wallet,
        montant,
        type: TransactionType.ESCROW_LOCK,
        effet: 'blocage',
        idempotencyKey: `invest:${args.investisseur.user.userId}:${investment.id}`,
        investissementId: investment.id,
        projetId: args.projet.id,
        ageJours: args.jourSouscription,
      });
      // …puis libération vers le projet à l'expiration du délai.
      if (args.statutFinal === InvestmentStatus.CONFIRME) {
        await this.tx({
          source: wallet,
          destination: args.walletProjet,
          montant,
          type: TransactionType.ESCROW_RELEASE,
          effet: 'liberation',
          idempotencyKey: `retract-release:${investment.id}`,
          investissementId: investment.id,
          projetId: args.projet.id,
          metadata: { kind: 'confirmation_delai_reflexion' },
          ageJours: args.jourConfirmation ?? args.jourSouscription,
        });
      }
    }

    return investment;
  }

  /**
   * Versement au porteur constaté hors plateforme — MÊME forme d'écriture que
   * `ProjectLedgerService.declarerVersementPorteur` (et que le canal Stripe de
   * `VerserPorteurUseCase`) : type RETRAIT, `metadata.kind =
   * 'versement_porteur'`, contrepartie externe (destination NULL), clé
   * d'idempotence `versement-porteur:<projetId>:<référence>`.
   */
  private async verserPorteur(args: {
    projet: ProjectEntity;
    walletProjet: WalletEntity;
    montant: number;
    reference: string;
    declarePar: UserEntity;
    ageJours: number;
    commentaire?: string;
  }): Promise<void> {
    await this.tx({
      source: args.walletProjet,
      destination: null,
      montant: args.montant,
      type: TransactionType.RETRAIT,
      fournisseur: TransactionFournisseur.MANUEL,
      referenceExterne: args.reference,
      idempotencyKey: `versement-porteur:${args.projet.id}:${args.reference}`,
      projetId: args.projet.id,
      metadata: {
        kind: KIND_VERSEMENT_PORTEUR,
        dateVersement: this.daysAgo(args.ageJours).toISOString(),
        commentaire:
          args.commentaire ??
          'Mise à disposition des fonds de la collecte (virement SEPA).',
        declarePar: args.declarePar.userId,
      },
      ageJours: args.ageJours,
    });
  }

  /**
   * Apport du porteur au wallet technique de son projet — même forme que
   * `CrediterApportPorteurUseCase` (contrepartie externe : la carte).
   */
  private async apportPorteur(args: {
    projet: ProjectEntity;
    walletProjet: WalletEntity;
    montant: number;
    paymentIntentId: string;
    porteur: UserEntity;
    ageJours: number;
  }): Promise<void> {
    await this.tx({
      source: null,
      destination: args.walletProjet,
      montant: args.montant,
      type: TransactionType.APPORT_PORTEUR,
      fournisseur: TransactionFournisseur.STRIPE,
      fournisseurRef: args.paymentIntentId,
      idempotencyKey: `apport-porteur:${args.paymentIntentId}`,
      projetId: args.projet.id,
      metadata: {
        porteurUserId: args.porteur.userId,
        paymentIntentId: args.paymentIntentId,
        origine: 'webhook',
      },
      ageJours: args.ageJours,
    });
  }

  /**
   * Tronque les tables peuplées par le seed (idempotence + emails uniques).
   * Ne cible que les tables réellement présentes → robuste aux schémas partiels.
   */
  private async reset(): Promise<void> {
    const wanted = [
      'users',
      'user_emails',
      'profil_personne_physique',
      'profil_personne_morale',
      'kyc',
      'questionnaire_adequation',
      'spv',
      'projet',
      'sortie_projet',
      'wallet',
      'transaction_paiement',
      'investissement',
      'echeance',
      'reservation',
      'unite_louable',
      'locataire',
      'bail',
      'loyer_encaisse',
      'charge',
      'periode_distribution',
      'distribution_part',
      'reclamation',
      'news',
      'notification',
      'audit_log',
      'document',
      'ordre_marche',
      'avis',
      'signature',
      'demande_acces_porteur',
    ];
    const rows: Array<{ table_name: string }> = await this.dataSource.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1)`,
      [wanted],
    );
    if (rows.length === 0) return;
    const existing = rows.map((r) => `"${r.table_name}"`).join(', ');
    await this.dataSource.query(
      `TRUNCATE TABLE ${existing} RESTART IDENTITY CASCADE`,
    );
  }

  // ── Seed principal ─────────────────────────────────────────────────────────

  async seed(_force = false): Promise<void> {
    this.logger.warn(
      '🧨 DATAFAKE BeOwn — les tables seront tronquées puis re-remplies.',
    );
    this.livre = new LivreSeed();
    await this.reset();

    const pwdAdmin = await bcrypt.hash(this.ADMIN_PASSWORD, 12);
    const pwdPorteur = await bcrypt.hash(this.PORTEUR_PASSWORD, 12);
    const pwdInvestisseur = await bcrypt.hash(this.INVESTISSEUR_PASSWORD, 12);

    // ════════════════════════════════════════════════════════════════════════
    // 1. UTILISATEURS — l'ORDRE DE CRÉATION EST CONTRACTUEL : les procédures de
    //    test référencent des userId (investisseur1 = 8, investisseur4 = 11).
    //    Tout nouvel utilisateur s'ajoute APRÈS les 14 premiers.
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('👥 Création des 20 utilisateurs...');

    const createUser = async (
      firstname: string,
      lastname: string,
      email: string,
      role: UserRole,
      password: string,
      userType: UserType | null,
    ): Promise<UserEntity> => {
      const user = await this.userRepo.save(
        this.userRepo.create({
          firstname,
          lastname,
          password,
          role,
          status: UserStatus.ACTIF,
          userType,
          cguAccepteesLe: this.daysAgo(120),
          lastLoginAt: this.daysAgo(1),
        }),
      );
      // 1 seul email, unique, vérifié → un utilisateur = une adresse mail
      await this.emailRepo.save(
        this.emailRepo.create({
          email,
          isVerified: true,
          verifiedDate: this.daysAgo(119),
          user,
        } as any),
      );
      return user;
    };

    // 1-5 : back-office historique (ids stables)
    const admin = await createUser('Awa', 'Diallo', 'admin@beown.fr', UserRole.SUPER_ADMIN, pwdAdmin, null);
    await createUser('Chloé', 'CIO', 'cio@beown.fr', UserRole.CIO, pwdAdmin, null);
    const marketing = await createUser('Marc', 'Marketing', 'marketing@beown.fr', UserRole.MARKETING, pwdAdmin, null);
    await createUser('Awa', 'Analyste', 'analyste@beown.fr', UserRole.ANALYSTE_FINANCIER, pwdAdmin, null);
    await createUser('Paul', 'Relation', 'relation@beown.fr', UserRole.CHARGE_RELATION_INVESTISSEUR, pwdAdmin, null);
    // 6-7 : porteurs historiques
    const porteur1 = await createUser('Mamadou', 'Sow', 'porteur1@beown.fr', UserRole.PORTEUR, pwdPorteur, UserType.PM);
    const porteur2 = await createUser('Koffi', 'Mensah', 'porteur2@beown.fr', UserRole.PORTEUR, pwdPorteur, UserType.PM);
    // 8-10 : investisseurs historiques (KYC validé)
    const uInv1 = await createUser('Fatou', 'Ndiaye', 'investisseur1@beown.fr', UserRole.INVESTISSEUR, pwdInvestisseur, UserType.PP);
    const uInv2 = await createUser('Ibrahima', 'Ba', 'investisseur2@beown.fr', UserRole.INVESTISSEUR, pwdInvestisseur, UserType.PP);
    const uInv3 = await createUser('Aïssatou', 'Fall', 'investisseur3@beown.fr', UserRole.INVESTISSEUR, pwdInvestisseur, UserType.PP);
    // 11 : persona « gating KYC » — AUCUN dossier KYC, AUCUN wallet, AUCUN
    // profil : l'état exact d'un compte fraîchement inscrit. Auparavant créé à
    // la main (sign-up API) après chaque reset ; désormais seedé, même userId.
    // NE PAS valider son KYC pendant les tests.
    await createUser('Jean-Hugues', 'Técher', 'investisseur4@beown.fr', UserRole.INVESTISSEUR, pwdInvestisseur, UserType.PP);
    // 12 : porteur réunionnais (marché cible La Réunion / France)
    const porteur3 = await createUser('Laurent', 'Hoarau', 'porteur3@beown.fr', UserRole.PORTEUR, pwdPorteur, UserType.PM);
    // 13 : investisseuse réunionnaise — KYC REFUSÉ (motif visible côté admin)
    const uInv5 = await createUser('Marie', 'Payet', 'investisseur5@beown.fr', UserRole.INVESTISSEUR, pwdInvestisseur, UserType.PP);
    // 14 : investisseur PERSONNE MORALE réunionnais — KYC en revue manuelle
    const uInv6 = await createUser('Sylvain', 'Grondin', 'investisseur6@beown.fr', UserRole.INVESTISSEUR, pwdInvestisseur, UserType.PM);
    // 15-20 : rôles complémentaires (auparavant clonés en SQL hors seed —
    // désormais seedés : plus de clonage ni de réalignement de séquences).
    await createUser('Claire', 'Conformité', 'compliance@beown.fr', UserRole.COMPLIANCE, pwdAdmin, null);
    await createUser('Frank', 'Finance', 'financier@beown.fr', UserRole.FINANCIER, pwdAdmin, null);
    await createUser('Sam', 'Support', 'support@beown.fr', UserRole.SUPPORT, pwdAdmin, null);
    await createUser('Diane', 'Données', 'dpo@beown.fr', UserRole.DPO, pwdAdmin, null);
    await createUser('Rachid', 'Contrôle', 'rcci@beown.fr', UserRole.RCCI, pwdAdmin, null);
    await createUser('Camille', 'Gestion', 'cgp@beown.fr', UserRole.CGP, pwdAdmin, null);
    // 21-22 : personas ACCÈS PORTEUR (lot 4, décision fondateur D1). Ajoutés
    // APRÈS les 20 existants — aucun userId antérieur ne bouge.
    // 21 : demande SOUMISE, en attente d'instruction par le back-office.
    const uInv7 = await createUser('Nadia', 'Rivière', 'investisseur7@beown.fr', UserRole.INVESTISSEUR, pwdInvestisseur, UserType.PP);
    // 22 : DOUBLE ACCÈS déjà accordé — rôle investisseur CONSERVÉ, plus
    // `porteurAccess`. C'est le compte qui prouve la décision D1 en recette :
    // il doit voir son espace investisseur ET l'espace porteur.
    const uInv8 = await createUser('Téo', 'Lebon', 'investisseur8@beown.fr', UserRole.INVESTISSEUR, pwdInvestisseur, UserType.PP);
    await this.userRepo.update(
      { userId: uInv8.userId },
      { porteurAccess: true },
    );

    this.logger.log('✅ 22 utilisateurs créés (emails uniques, userId stables)');

    // ── Demandes d'accès porteur (lot 4) ─────────────────────────────────────
    // Deux dossiers, un par persona. Celui d'inv8 est ACCEPTÉ : le drapeau
    // `porteurAccess` posé plus haut n'est jamais orphelin — la pièce qui
    // justifie l'octroi existe, comme l'exige l'examen prévu aux CGU.
    await this.demandeAccesPorteurRepo.save(
      this.demandeAccesPorteurRepo.create({
        utilisateurId: uInv7.userId,
        statut: StatutDemandeAccesPorteur.SOUMISE,
        motivation:
          "Je porte un immeuble de trois logements à Saint-Denis et souhaite le financer sur BeOwn. J'ai déjà mené deux opérations de rénovation en nom propre.",
        cguVersionAcceptee: CGU_VERSION_COURANTE,
        soumiseLe: this.daysAgo(4),
        decideeLe: null,
        decideurAdminId: null,
        motifRefus: null,
        motifRefusComplement: null,
      }),
    );
    const demandeAcceptee = await this.demandeAccesPorteurRepo.save(
      this.demandeAccesPorteurRepo.create({
        utilisateurId: uInv8.userId,
        statut: StatutDemandeAccesPorteur.ACCEPTEE,
        motivation:
          "Gérant d'une SCI familiale au Tampon, je souhaite proposer un programme de deux villas en location longue durée et conserver mon compte investisseur.",
        cguVersionAcceptee: CGU_VERSION_COURANTE,
        soumiseLe: this.daysAgo(40),
        decideeLe: this.daysAgo(33),
        // Décision IMPUTABLE à un humain : les CGU excluent toute décision
        // entièrement automatisée.
        decideurAdminId: admin.userId,
        motifRefus: null,
        motifRefusComplement: null,
      }),
    );
    await this.audit(admin, 'porteur_access.demande.acceptee', 'demande_acces_porteur', demandeAcceptee.id, this.daysAgo(33));
    this.logger.log(
      "✅ Accès porteur : 1 demande soumise (inv7), 1 acceptée + double accès (inv8)",
    );

    // ════════════════════════════════════════════════════════════════════════
    // 2. PROFILS, KYC & QUESTIONNAIRES D'ADÉQUATION
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('📝 Profils, KYC & questionnaires...');

    // Porteurs → personnes morales (sociétés de promotion)
    await this.profilPMRepo.save(
      this.profilPMRepo.create({
        utilisateurId: porteur1.userId,
        raisonSociale: 'Sow Promotion Immobilière SARL',
        formeJuridique: 'SARL',
        siren: 'SN-RC-2021-A-1001',
        rcsVille: 'Dakar',
        capitalSocial: 150_000,
        siegeAdresse: '15 Avenue Cheikh Anta Diop, Dakar',
        representantId: porteur1.userId,
        secteurActivite: 'Immobilier',
      } as any),
    );
    await this.profilPMRepo.save(
      this.profilPMRepo.create({
        utilisateurId: porteur2.userId,
        raisonSociale: 'Mensah Real Estate SAS',
        formeJuridique: 'SAS',
        siren: 'CI-RC-2020-B-2002',
        rcsVille: 'Abidjan',
        capitalSocial: 250_000,
        siegeAdresse: 'Rue des Bâtisseurs, Cocody, Abidjan',
        representantId: porteur2.userId,
        secteurActivite: 'Immobilier',
      } as any),
    );
    await this.profilPMRepo.save(
      this.profilPMRepo.create({
        utilisateurId: porteur3.userId,
        raisonSociale: 'Hoarau Océan Indien Promotion SAS',
        formeJuridique: 'SAS',
        siren: '911452388',
        rcsVille: 'Saint-Denis de La Réunion',
        capitalSocial: 320_000,
        siegeAdresse: '12 rue de Paris, 97400 Saint-Denis, La Réunion',
        representantId: porteur3.userId,
        secteurActivite: 'Promotion immobilière',
      } as any),
    );

    // Investisseurs personnes physiques.
    // inv1-3 : profils historiques conservés (Dakar) ; inv5 : La Réunion.
    const ppData: Array<{
      u: UserEntity;
      civilite: string;
      profession: string;
      cat: CategorieInvestisseur;
      adresse: string;
      codePostal: string;
      ville: string;
      pays: string;
      telephone: string;
      patrimoine: number | null;
    }> = [
      {
        u: uInv1, civilite: 'Mme', profession: 'Médecin', cat: CategorieInvestisseur.AVERTI,
        adresse: '24 Rue de la Corniche', codePostal: '11000', ville: 'Dakar', pays: 'SN',
        telephone: `+221 77 ${100 + uInv1.userId} 00 0${uInv1.userId}`, patrimoine: 480_000,
      },
      {
        u: uInv2, civilite: 'M.', profession: 'Ingénieur', cat: CategorieInvestisseur.NON_AVERTI,
        adresse: '24 Rue de la Corniche', codePostal: '11000', ville: 'Dakar', pays: 'SN',
        telephone: `+221 77 ${100 + uInv2.userId} 00 0${uInv2.userId}`, patrimoine: 60_000,
      },
      {
        u: uInv3, civilite: 'Mme', profession: 'Cadre bancaire', cat: CategorieInvestisseur.NON_AVERTI,
        adresse: '24 Rue de la Corniche', codePostal: '11000', ville: 'Dakar', pays: 'SN',
        telephone: `+221 77 ${100 + uInv3.userId} 00 0${uInv3.userId}`, patrimoine: 90_000,
      },
      {
        u: uInv5, civilite: 'Mme', profession: 'Infirmière libérale', cat: CategorieInvestisseur.NON_AVERTI,
        adresse: '8 rue Auguste Babet', codePostal: '97410', ville: 'Saint-Pierre', pays: 'FR',
        telephone: '+262 692 34 56 78', patrimoine: null,
      },
      // inv7 / inv8 — personas d'ACCÈS PORTEUR. Ils n'avaient ni profil PP ni
      // dossier KYC : le gating KYC bloquait donc toute action financière, et
      // la recette de bout en bout du parcours porteur (soumettre un projet,
      // déclarer un loyer, suivre une trésorerie) s'arrêtait à la première
      // porte — sur un compte qui, par construction, est censé l'avoir
      // franchie. Profil complet + KYC VALIDE plus bas.
      {
        u: uInv7, civilite: 'Mme', profession: 'Architecte', cat: CategorieInvestisseur.NON_AVERTI,
        adresse: '17 rue Jean Chatel', codePostal: '97400', ville: 'Saint-Denis', pays: 'FR',
        telephone: '+262 692 11 22 33', patrimoine: 145_000,
      },
      {
        u: uInv8, civilite: 'M.', profession: 'Gérant de société', cat: CategorieInvestisseur.AVERTI,
        adresse: '3 chemin des Cocotiers', codePostal: '97434', ville: 'Saint-Gilles-les-Bains', pays: 'FR',
        telephone: '+262 692 44 55 66', patrimoine: 620_000,
      },
    ];
    for (const p of ppData) {
      await this.profilPPRepo.save(
        this.profilPPRepo.create({
          utilisateurId: p.u.userId,
          civilite: p.civilite,
          prenom: p.u.firstname,
          nom: p.u.lastname,
          dateNaissance: new Date(1985, 4, 12),
          lieuNaissance: p.pays === 'FR' ? 'Saint-Pierre' : 'Dakar',
          paysNaissance: p.pays,
          nationalite: p.pays,
          adresseLigne1: p.adresse,
          codePostal: p.codePostal,
          ville: p.ville,
          pays: p.pays,
          telephone: p.telephone,
          profession: p.profession,
          secteurActivite: p.pays === 'FR' ? 'Santé' : 'Finance',
          pep: false,
          residenceFiscale: p.pays,
          nif: `NIF-${1_000_000 + p.u.userId}`,
          categoriePsfp: p.cat,
          patrimoineNetCalcule: p.patrimoine,
          seuilAvertissementCalcule:
            p.patrimoine == null ? null : Math.max(1_000, round2(p.patrimoine * 0.05)),
          evaluationExpireLe: p.patrimoine == null ? null : this.daysAhead(600),
        } as any),
      );
    }

    // Investisseur personne morale (inv6) — société patrimoniale du Tampon.
    await this.profilPMRepo.save(
      this.profilPMRepo.create({
        utilisateurId: uInv6.userId,
        raisonSociale: 'Grondin Invest SAS',
        formeJuridique: 'SAS',
        siren: '902316745',
        rcsVille: 'Saint-Pierre de La Réunion',
        capitalSocial: 250_000,
        siegeAdresse: '45 rue Hubert Delisle, 97430 Le Tampon, La Réunion',
        representantId: uInv6.userId,
        secteurActivite: 'Holding patrimoniale',
      } as any),
    );

    // KYC — états variés répartis sur les investisseurs :
    //  inv1/inv2/inv3 : VALIDE ; inv4 : AUCUN dossier (non commencé, persona
    //  gating) ; inv5 : REFUSE avec motif ; inv6 (PM) : EN_REVUE (revue
    //  manuelle admin, niveau renforcé) ; inv7/inv8 : VALIDE — ce sont les
    //  personas d'accès porteur, et un parcours porteur de bout en bout n'a
    //  aucun sens depuis un compte que le gating KYC arrête au premier geste.
    for (const u of [uInv1, uInv2, uInv3, uInv7, uInv8]) {
      await this.kycRepo.save(
        this.kycRepo.create({
          utilisateurId: u.userId,
          statut: KycStatus.VALIDE,
          niveau: KycNiveau.STANDARD,
          scoreRisque: 20,
          fournisseur: 'stripe',
          fournisseurRef: `vs_seed_${u.userId}`,
          valideJusquAu: this.daysAhead(365),
          identiteExtrait: {
            nom: u.lastname,
            prenom: u.firstname,
            typeDocument: 'passeport',
            dateNaissance: '1985-05-12',
          },
        } as any),
      );
    }
    await this.kycRepo.save(
      this.kycRepo.create({
        utilisateurId: uInv5.userId,
        statut: KycStatus.REFUSE,
        niveau: KycNiveau.STANDARD,
        scoreRisque: 65,
        fournisseur: 'stripe',
        fournisseurRef: `vs_seed_${uInv5.userId}`,
        motifRefus:
          "Pièce d'identité expirée et justificatif de domicile illisible — merci de soumettre des documents en cours de validité.",
      } as any),
    );
    await this.kycRepo.save(
      this.kycRepo.create({
        utilisateurId: uInv6.userId,
        statut: KycStatus.EN_REVUE,
        niveau: KycNiveau.RENFORCE,
        scoreRisque: 40,
        fournisseur: 'stripe',
        fournisseurRef: `vs_seed_${uInv6.userId}`,
      } as any),
    );

    // Questionnaires d'adéquation (règlement (UE) 2020/1503) — remplis pour
    // les KYC validés (catégories variées) + pour la personne morale en revue.
    await this.questionnaireRepo.save(
      this.questionnaireRepo.create({
        utilisateurId: uInv1.userId,
        revenuBrutAnnuel: 95_000,
        portefeuilleInstrumentsFinanciers: 150_000,
        experienceProfessionnelleFinanciere: true,
        transactionsMoyennesParTrimestre: 12,
        revenuAnnuel: 95_000,
        actifsTotaux: 620_000,
        engagementsFinanciers: 140_000,
        simulationPerteAcceptee: true,
        demandeStatutAverti: true,
        avertissementStatutAvertiAccepte: true,
        testConnaissancesScore: 9,
        testConnaissancesTotal: 10,
        testConnaissancesAdequat: true,
        resultCategorie: 'averti',
        criteresRemplis: ['revenu_brut_annuel', 'portefeuille_instruments', 'experience_professionnelle'],
        patrimoineNetCalcule: 480_000,
        capaciteDePerteSimulee: 48_000,
        seuilAvertissementCalcule: 24_000,
        evalueeLe: this.daysAgo(100),
        expireLe: this.daysAhead(630),
      } as any),
    );
    await this.questionnaireRepo.save(
      this.questionnaireRepo.create({
        utilisateurId: uInv2.userId,
        revenuBrutAnnuel: 42_000,
        portefeuilleInstrumentsFinanciers: 18_000,
        experienceProfessionnelleFinanciere: false,
        transactionsMoyennesParTrimestre: 2,
        revenuAnnuel: 42_000,
        actifsTotaux: 95_000,
        engagementsFinanciers: 35_000,
        simulationPerteAcceptee: true,
        testConnaissancesScore: 7,
        testConnaissancesTotal: 10,
        testConnaissancesAdequat: true,
        resultCategorie: 'non_averti',
        criteresRemplis: [],
        patrimoineNetCalcule: 60_000,
        capaciteDePerteSimulee: 6_000,
        seuilAvertissementCalcule: 3_000,
        evalueeLe: this.daysAgo(95),
        expireLe: this.daysAhead(635),
      } as any),
    );
    await this.questionnaireRepo.save(
      this.questionnaireRepo.create({
        utilisateurId: uInv3.userId,
        revenuBrutAnnuel: 55_000,
        portefeuilleInstrumentsFinanciers: 40_000,
        experienceProfessionnelleFinanciere: true,
        transactionsMoyennesParTrimestre: 4,
        revenuAnnuel: 55_000,
        actifsTotaux: 130_000,
        engagementsFinanciers: 40_000,
        simulationPerteAcceptee: true,
        testConnaissancesScore: 5,
        testConnaissancesTotal: 10,
        testConnaissancesAdequat: false,
        avertissementInadequationAccepte: true,
        resultCategorie: 'non_averti',
        criteresRemplis: [],
        patrimoineNetCalcule: 90_000,
        capaciteDePerteSimulee: 9_000,
        seuilAvertissementCalcule: 4_500,
        evalueeLe: this.daysAgo(90),
        expireLe: this.daysAhead(640),
      } as any),
    );
    await this.questionnaireRepo.save(
      this.questionnaireRepo.create({
        utilisateurId: uInv6.userId,
        fondsPropres: 250_000,
        chiffreAffairesNet: 3_400_000,
        totalBilan: 1_900_000,
        simulationPerteAcceptee: true,
        demandeStatutAverti: true,
        avertissementStatutAvertiAccepte: true,
        testConnaissancesScore: 8,
        testConnaissancesTotal: 10,
        testConnaissancesAdequat: true,
        resultCategorie: 'averti',
        criteresRemplis: ['fonds_propres', 'chiffre_affaires_net', 'total_bilan'],
        evalueeLe: this.daysAgo(12),
        expireLe: this.daysAhead(718),
      } as any),
    );

    this.logger.log(
      '✅ Profils PM (3 porteurs + 1 investisseur PM), PP, KYC (validé ×3, refusé, en revue, non commencé) & questionnaires',
    );

    // ════════════════════════════════════════════════════════════════════════
    // 3. SPV
    // ════════════════════════════════════════════════════════════════════════
    const spvA = (await this.spvRepo.save(
      this.spvRepo.create({
        raisonSociale: 'BeOwn Les Jardins SPV SAS',
        siren: '900112233',
        forme: 'SAS',
        capitalSocial: 10_000,
        siegeAdresse: 'Dakar, Sénégal',
        iban: 'SN08SN0100150000000000001',
        dateConstitution: this.daysAgo(120),
        gestionnaireUserId: porteur1.userId,
      } as any) as any,
    )) as SpvEntity;

    const spvG = (await this.spvRepo.save(
      this.spvRepo.create({
        raisonSociale: 'BeOwn Les Flamboyants SPV SAS',
        siren: '913245670',
        forme: 'SAS',
        capitalSocial: 5_000,
        siegeAdresse: '45 rue Hubert Delisle, 97430 Le Tampon, La Réunion',
        iban: 'FR7630004000031234567890143',
        dateConstitution: this.daysAgo(60),
        gestionnaireUserId: porteur3.userId,
      } as any) as any,
    )) as SpvEntity;

    // ════════════════════════════════════════════════════════════════════════
    // 4. PROJETS — 7 projets, tous les statuts du cycle de vie
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('🏗️ Création des 7 projets...');

    // A — EN_EXPLOITATION (equity, Dakar) — l'historique riche.
    const CAPITAL_A = 600_000;
    const NB_FRACTIONS_A = 6_000;
    const PRIX_FRACTION_A = CAPITAL_A / NB_FRACTIONS_A; // 100 €
    const LOYER_A = 4_500;

    const projetA = (await this.projectRepo.save(
      this.projectRepo.create({
        slug: 'residence-les-jardins-dakar',
        titre: 'Résidence Les Jardins — Dakar Plateau',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.EN_EXPLOITATION,
        ville: 'Dakar',
        region: 'Dakar',
        pays: 'SN',
        adresseComplete: '10 Rue Carnot, Plateau, Dakar',
        latitude: 14.6708,
        longitude: -17.4381,
        capitalCible: CAPITAL_A,
        capitalMinimum: 360_000,
        ticketMinimum: PRIX_FRACTION_A,
        ticketMaximum: 300_000,
        nbFractions: NB_FRACTIONS_A,
        prixFraction: PRIX_FRACTION_A,
        triCible: 9.0,
        indiceRisque: 3,
        dureeMois: 36,
        instrument: ProjectInstrument.PART_SOCIALE,
        modeleEconomique: ModeleEconomique.EQUITY,
        nbUnitesLouables: 1,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        descriptionMd: `## Résidence Les Jardins — Dakar Plateau

Immeuble résidentiel de 6 appartements loués, détenu via la SPV **BeOwn Les Jardins**. Les investisseurs détiennent des **parts sociales** et perçoivent une **distribution mensuelle** au prorata, issue des loyers nets encaissés.

- **Capital collecté :** 600 000 € (6 000 parts de 100 €) — **100 % financé**
- **Loyer mensuel :** 4 500 €
- **Rendement cible :** 9 % / an (distribution mensuelle)

> Investir comporte un risque de perte en capital. Placement illiquide.`,
        avertissementMd:
          'Investir comporte des risques de perte partielle ou totale du capital. Les performances passées ne préjugent pas des performances futures. Placement illiquide.',
        fici: ficiComplet({
          porteur: 'Sow Promotion Immobilière SARL',
          villePorteur: 'Dakar',
          bien: 'un immeuble résidentiel de 6 appartements loués (420 m²)',
          villeBien: 'Dakar Plateau',
          societeSupport: 'BeOwn Les Jardins SPV SAS',
          nbParts: NB_FRACTIONS_A,
          prixPart: PRIX_FRACTION_A,
          capitalCible: CAPITAL_A,
          capitalMinimum: 360_000,
          triCible: 9,
          dureeMois: 36,
        }),
        chronologie: [
          { etape: 'Publication du projet', date: this.daysAgo(90).toISOString().slice(0, 10), statut: 'done', description: 'Dossier validé et publié par BeOwn.' },
          { etape: 'Ouverture de la collecte', date: this.daysAgo(85).toISOString().slice(0, 10), statut: 'done' },
          { etape: 'Clôture — 100 % financé', date: this.daysAgo(60).toISOString().slice(0, 10), statut: 'done', description: '6 000 / 6 000 parts souscrites.' },
          { etape: 'Mise en exploitation', date: this.daysAgo(50).toISOString().slice(0, 10), statut: 'done', description: 'Perception et distribution des loyers.' },
          { etape: 'Cession du bien (étudiée)', date: this.daysAhead(75).toISOString().slice(0, 10), statut: 'in_progress', description: 'Sortie projetée : 690 000 €.' },
          { etape: 'Remboursement final', date: this.daysAhead(36 * 30).toISOString().slice(0, 10), statut: 'pending' },
        ],
        garanties: [
          { type: 'Hypothèque 1er rang', description: 'Inscription sur le bien au profit de la SPV.', rang: 1 },
        ],
        previsionnel: {
          operation: {
            acquisition: 480_000,
            fraisNotaire: 35_000,
            travaux: 60_000,
            sequestre: 15_000,
            fraisHypotheque: 6_000,
            fraisFinanciers: 4_000,
          },
          financement: { apport: 60_000, financementBancaire: 0, montantInvestisseurs: CAPITAL_A },
          resultat: { montantRevente: 690_000, coutOperation: 600_000 },
        },
        porteurId: porteur1.userId,
        spvId: spvA.id,
        datePublication: this.daysAgo(90),
        dateOuvertureCollecte: this.daysAgo(85),
        dateCloturePrevue: this.daysAgo(58),
      } as any) as any,
    )) as ProjectEntity;

    // B — BROUILLON (porteur2) — document d'informations clés incomplet.
    const projetB = (await this.projectRepo.save(
      this.projectRepo.create({
        slug: 'villas-cocody-abidjan',
        titre: 'Villas Cocody — Abidjan (en cours de validation)',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.BROUILLON,
        ville: 'Abidjan',
        region: 'Lagunes',
        pays: 'CI',
        capitalCible: 400_000,
        capitalMinimum: 240_000,
        ticketMinimum: 100,
        ticketMaximum: 200_000,
        nbFractions: 4_000,
        prixFraction: 100,
        triCible: 10.0,
        indiceRisque: 4,
        dureeMois: 24,
        instrument: ProjectInstrument.PART_SOCIALE,
        modeleEconomique: ModeleEconomique.EQUITY,
        estPreInvestissable: false,
        descriptionMd:
          '## Villas Cocody — Abidjan\n\nDossier soumis par le porteur, en cours d’instruction par le comité BeOwn avant publication.',
        avertissementMd:
          'Investir comporte des risques de perte partielle ou totale du capital.',
        fici: ficiPartiel('Mensah Real Estate SAS', 'Trois villas jumelées à Cocody'),
        porteurId: porteur2.userId,
      } as any) as any,
    )) as ProjectEntity;

    // C — EN_COLLECTE obligataire (porteur1) — coupon fixe, échéancier généré.
    const projetC = (await this.projectRepo.save(
      this.projectRepo.create({
        slug: 'bureaux-plateau-abidjan-obligation',
        titre: 'Bureaux Plateau — Abidjan (obligation)',
        type: ProjectType.TERTIAIRE,
        statut: ProjectStatus.EN_COLLECTE,
        ville: 'Abidjan',
        region: 'Lagunes',
        pays: 'CI',
        adresseComplete: 'Boulevard de la République, Plateau, Abidjan',
        latitude: 5.32,
        longitude: -4.02,
        capitalCible: 500_000,
        capitalMinimum: 300_000,
        ticketMinimum: 500,
        ticketMaximum: 100_000,
        nbFractions: 1_000,
        prixFraction: 500,
        triCible: 8.5,
        indiceRisque: 4,
        dureeMois: 24,
        instrument: ProjectInstrument.OBLIGATION,
        modeleEconomique: ModeleEconomique.OBLIGATAIRE,
        estPreInvestissable: false,
        descriptionMd: `## Bureaux Plateau — Abidjan (obligation)

Financement **obligataire** d'un plateau de bureaux loué à un locataire unique. Les investisseurs souscrivent des **obligations** et perçoivent un **coupon fixe** — il ne s'agit pas d'un placement locatif en parts, mais d'un titre de créance.

- **Montant de l'émission :** 500 000 € (1 000 obligations de 500 €)
- **Coupon :** 8,5 % / an
- **Durée :** 24 mois, remboursement du capital in fine

> Investir comporte un risque de perte en capital. Placement illiquide, non garanti par l'État.`,
        avertissementMd:
          "Obligations : risque de défaut de l'émetteur et de perte totale du capital. Le coupon n'est pas garanti. Placement illiquide.",
        fici: ficiComplet({
          porteur: 'Sow Promotion Immobilière SARL',
          villePorteur: 'Dakar',
          bien: 'un plateau de bureaux de 800 m² loué à un locataire unique',
          villeBien: 'Abidjan Plateau',
          societeSupport: null,
          nbParts: 1_000,
          prixPart: 500,
          capitalCible: 500_000,
          capitalMinimum: 300_000,
          triCible: 8.5,
          dureeMois: 24,
        }),
        chronologie: [
          { etape: 'Publication du projet', date: this.daysAgo(25).toISOString().slice(0, 10), statut: 'done' },
          { etape: 'Ouverture de la collecte', date: this.daysAgo(20).toISOString().slice(0, 10), statut: 'in_progress' },
          { etape: 'Clôture de la collecte', date: this.daysAhead(30).toISOString().slice(0, 10), statut: 'pending' },
          { etape: 'Remboursement du capital (in fine)', date: this.daysAhead(24 * 30).toISOString().slice(0, 10), statut: 'pending' },
        ],
        garanties: [
          { type: 'Nantissement des créances de loyers', description: 'Loyers du locataire unique nantis au profit des porteurs obligataires.', rang: 1 },
        ],
        echeancierEmprunteur: Array.from({ length: 8 }, (_, i) => ({
          numero: i + 1,
          datePrevue: this.daysAhead((i + 1) * 90).toISOString().slice(0, 10),
          montantCapital: i === 7 ? 500_000 : 0,
          montantInterets: 10_625, // 500 000 × 8,5 % / 4
          montantFraisPlateforme: 0,
          montantFraisRetard: 0,
          tauxInteretsAnnuel: 8.5,
          tauxRetardAnnuel: 12,
          montantTotal: (i === 7 ? 500_000 : 0) + 10_625,
          statut: 'a_venir' as const,
        })),
        porteurId: porteur1.userId,
        datePublication: this.daysAgo(25),
        dateOuvertureCollecte: this.daysAgo(20),
        dateCloturePrevue: this.daysAhead(30),
        broadcastCollecteAt: this.daysAgo(20),
      } as any) as any,
    )) as ProjectEntity;

    // D — ANNONCE pré-investissable (porteur3, Saint-Denis) — réservations.
    const projetD = (await this.projectRepo.save(
      this.projectRepo.create({
        slug: 'residence-oceane-saint-denis',
        titre: 'Résidence Océane — Saint-Denis',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.ANNONCE,
        ville: 'Saint-Denis',
        region: 'La Réunion',
        pays: 'FR',
        adresseComplete: '28 boulevard de la Providence, 97400 Saint-Denis, La Réunion',
        latitude: -20.8823,
        longitude: 55.4504,
        capitalCible: 350_000,
        capitalMinimum: 210_000,
        ticketMinimum: 100,
        ticketMaximum: 150_000,
        nbFractions: 3_500,
        prixFraction: 100,
        triCible: 8.5,
        indiceRisque: 3,
        dureeMois: 48,
        instrument: ProjectInstrument.PART_SOCIALE,
        modeleEconomique: ModeleEconomique.EQUITY,
        estPreInvestissable: true,
        plafondPreInvestissement: 100_000,
        descriptionMd: `## Résidence Océane — Saint-Denis

Petit collectif de 4 appartements (2 T2, 2 T3) proche du front de mer de Saint-Denis, entièrement loué. Ouverture de la collecte annoncée : **réservez votre place dans la file** dès maintenant.

- **Capital cible :** 350 000 € (3 500 parts de 100 €)
- **Rendement cible :** 8,5 % / an
- **Pré-investissement plafonné à 100 000 €**

> Investir comporte un risque de perte en capital. Placement illiquide.`,
        avertissementMd:
          'Investir comporte des risques de perte partielle ou totale du capital. Placement illiquide.',
        fici: ficiComplet({
          porteur: 'Hoarau Océan Indien Promotion SAS',
          villePorteur: 'Saint-Denis de La Réunion',
          bien: 'un collectif de 4 appartements loués (2 T2, 2 T3)',
          villeBien: 'Saint-Denis (La Réunion)',
          societeSupport: null,
          nbParts: 3_500,
          prixPart: 100,
          capitalCible: 350_000,
          capitalMinimum: 210_000,
          triCible: 8.5,
          dureeMois: 48,
        }),
        chronologie: [
          { etape: 'Annonce du projet', date: this.daysAgo(12).toISOString().slice(0, 10), statut: 'done' },
          { etape: 'Ouverture des réservations', date: this.daysAgo(10).toISOString().slice(0, 10), statut: 'in_progress' },
          { etape: 'Ouverture de la collecte', date: this.daysAhead(15).toISOString().slice(0, 10), statut: 'pending' },
        ],
        porteurId: porteur3.userId,
        datePublication: this.daysAgo(12),
        broadcastAnnonceAt: this.daysAgo(10),
      } as any) as any,
    )) as ProjectEntity;

    // E — EN_COLLECTE partiellement financée (porteur2, Saint-Pierre).
    const projetE = (await this.projectRepo.save(
      this.projectRepo.create({
        slug: 'coeur-de-ville-saint-pierre',
        titre: 'Cœur de Ville — Saint-Pierre',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.EN_COLLECTE,
        ville: 'Saint-Pierre',
        region: 'La Réunion',
        pays: 'FR',
        adresseComplete: '15 rue des Bons Enfants, 97410 Saint-Pierre, La Réunion',
        latitude: -21.3393,
        longitude: 55.4781,
        capitalCible: 450_000,
        capitalMinimum: 270_000,
        ticketMinimum: 100,
        ticketMaximum: 150_000,
        nbFractions: 4_500,
        prixFraction: 100,
        triCible: 8.0,
        indiceRisque: 3,
        dureeMois: 36,
        instrument: ProjectInstrument.PART_SOCIALE,
        modeleEconomique: ModeleEconomique.EQUITY,
        estPreInvestissable: false,
        descriptionMd: `## Cœur de Ville — Saint-Pierre

Immeuble mixte (3 logements + 1 local commercial loué à un opticien) au centre de Saint-Pierre. **Collecte en cours** — 37 000 € déjà engagés sur 450 000 €.

- **Capital cible :** 450 000 € (4 500 parts de 100 €)
- **Rendement cible :** 8 % / an (distribution mensuelle)

> Investir comporte un risque de perte en capital. Placement illiquide.`,
        avertissementMd:
          'Investir comporte des risques de perte partielle ou totale du capital. Placement illiquide.',
        fici: ficiComplet({
          porteur: 'Mensah Real Estate SAS',
          villePorteur: 'Abidjan',
          bien: 'un immeuble mixte de 3 logements et un local commercial loué',
          villeBien: 'Saint-Pierre (La Réunion)',
          societeSupport: null,
          nbParts: 4_500,
          prixPart: 100,
          capitalCible: 450_000,
          capitalMinimum: 270_000,
          triCible: 8,
          dureeMois: 36,
        }),
        chronologie: [
          { etape: 'Publication du projet', date: this.daysAgo(20).toISOString().slice(0, 10), statut: 'done' },
          { etape: 'Ouverture de la collecte', date: this.daysAgo(15).toISOString().slice(0, 10), statut: 'in_progress' },
          { etape: 'Clôture de la collecte', date: this.daysAhead(45).toISOString().slice(0, 10), statut: 'pending' },
        ],
        porteurId: porteur2.userId,
        datePublication: this.daysAgo(20),
        dateOuvertureCollecte: this.daysAgo(15),
        dateCloturePrevue: this.daysAhead(45),
        broadcastCollecteAt: this.daysAgo(15),
      } as any) as any,
    )) as ProjectEntity;

    // F — ECHEC (porteur2, L'Étang-Salé) — collecte remboursée intégralement.
    const projetF = (await this.projectRepo.save(
      this.projectRepo.create({
        slug: 'les-filaos-etang-sale',
        titre: 'Les Filaos — L’Étang-Salé (collecte non aboutie)',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.ECHEC,
        ville: "L'Étang-Salé",
        region: 'La Réunion',
        pays: 'FR',
        capitalCible: 280_000,
        capitalMinimum: 168_000,
        ticketMinimum: 100,
        ticketMaximum: 100_000,
        nbFractions: 2_800,
        prixFraction: 100,
        triCible: 7.5,
        indiceRisque: 4,
        dureeMois: 36,
        instrument: ProjectInstrument.PART_SOCIALE,
        modeleEconomique: ModeleEconomique.EQUITY,
        estPreInvestissable: false,
        descriptionMd:
          "## Les Filaos — L'Étang-Salé\n\nLa collecte n'a pas atteint son objectif minimum (168 000 €) à la date de clôture : **l'intégralité des fonds engagés a été restituée** aux souscripteurs, sans frais.",
        avertissementMd:
          'Investir comporte des risques de perte partielle ou totale du capital.',
        fici: ficiComplet({
          porteur: 'Mensah Real Estate SAS',
          villePorteur: 'Abidjan',
          bien: 'deux cases créoles rénovées destinées à la location',
          villeBien: "L'Étang-Salé (La Réunion)",
          societeSupport: null,
          nbParts: 2_800,
          prixPart: 100,
          capitalCible: 280_000,
          capitalMinimum: 168_000,
          triCible: 7.5,
          dureeMois: 36,
        }),
        porteurId: porteur2.userId,
        datePublication: this.daysAgo(85),
        dateOuvertureCollecte: this.daysAgo(80),
        dateCloturePrevue: this.daysAgo(50),
      } as any) as any,
    )) as ProjectEntity;

    // G — FINANCE (porteur3, Le Tampon) — exploitation locative réunionnaise :
    // loyers déclarés/validés, PAS de période de distribution → l'admin peut
    // dérouler le flux réel calcul → validation → exécution sur ce projet.
    const CAPITAL_G = 200_000;
    const NB_FRACTIONS_G = 2_000;
    const projetG = (await this.projectRepo.save(
      this.projectRepo.create({
        slug: 'les-flamboyants-le-tampon',
        titre: 'Les Flamboyants — Le Tampon',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.FINANCE,
        ville: 'Le Tampon',
        region: 'La Réunion',
        pays: 'FR',
        adresseComplete: '3 chemin des Flamboyants, 97430 Le Tampon, La Réunion',
        latitude: -21.2764,
        longitude: 55.5175,
        capitalCible: CAPITAL_G,
        capitalMinimum: 120_000,
        ticketMinimum: 100,
        ticketMaximum: 100_000,
        nbFractions: NB_FRACTIONS_G,
        prixFraction: 100,
        triCible: 8.0,
        indiceRisque: 2,
        dureeMois: 60,
        instrument: ProjectInstrument.PART_SOCIALE,
        modeleEconomique: ModeleEconomique.EQUITY,
        nbUnitesLouables: 2,
        estPreInvestissable: false,
        descriptionMd: `## Les Flamboyants — Le Tampon

Deux appartements (T3 et T2) dans une résidence récente du Tampon, tous deux loués. Détention via la SPV **BeOwn Les Flamboyants**. Collecte bouclée à 100 %, loyers en cours de perception.

- **Capital collecté :** 200 000 € (2 000 parts de 100 €) — **100 % financé**
- **Loyers mensuels :** 2 800 € (1 500 € + 1 300 €)
- **Rendement cible :** 8 % / an (distribution mensuelle)

> Investir comporte un risque de perte en capital. Placement illiquide.`,
        avertissementMd:
          'Investir comporte des risques de perte partielle ou totale du capital. Les performances passées ne préjugent pas des performances futures. Placement illiquide.',
        fici: ficiComplet({
          porteur: 'Hoarau Océan Indien Promotion SAS',
          villePorteur: 'Saint-Denis de La Réunion',
          bien: 'deux appartements loués (T3 de 68 m² et T2 de 52 m²)',
          villeBien: 'Le Tampon (La Réunion)',
          societeSupport: 'BeOwn Les Flamboyants SPV SAS',
          nbParts: NB_FRACTIONS_G,
          prixPart: 100,
          capitalCible: CAPITAL_G,
          capitalMinimum: 120_000,
          triCible: 8,
          dureeMois: 60,
        }),
        chronologie: [
          { etape: 'Publication du projet', date: this.daysAgo(55).toISOString().slice(0, 10), statut: 'done' },
          { etape: 'Ouverture de la collecte', date: this.daysAgo(50).toISOString().slice(0, 10), statut: 'done' },
          { etape: 'Clôture — 100 % financé', date: this.daysAgo(42).toISOString().slice(0, 10), statut: 'done' },
          { etape: 'Perception des loyers', date: this.daysAgo(35).toISOString().slice(0, 10), statut: 'in_progress' },
        ],
        previsionnel: {
          operation: {
            acquisition: 165_000,
            fraisNotaire: 13_000,
            travaux: 12_000,
            sequestre: 5_000,
            fraisHypotheque: 3_000,
            fraisFinanciers: 2_000,
          },
          financement: { apport: 0, financementBancaire: 0, montantInvestisseurs: CAPITAL_G },
          resultat: { montantRevente: 240_000, coutOperation: 200_000 },
        },
        porteurId: porteur3.userId,
        spvId: spvG.id,
        datePublication: this.daysAgo(55),
        dateOuvertureCollecte: this.daysAgo(50),
        dateCloturePrevue: this.daysAgo(42),
      } as any) as any,
    )) as ProjectEntity;

    await this.audit(porteur1, 'PROJECT_SUBMIT', 'PROJECT', projetA.id, this.daysAgo(92));
    await this.audit(admin, 'PROJECT_PUBLISH', 'PROJECT', projetA.id, this.daysAgo(90));
    await this.audit(porteur2, 'PROJECT_SUBMIT', 'PROJECT', projetB.id, this.daysAgo(3));
    await this.audit(porteur1, 'PROJECT_SUBMIT', 'PROJECT', projetC.id, this.daysAgo(27));
    await this.audit(admin, 'PROJECT_PUBLISH', 'PROJECT', projetC.id, this.daysAgo(25));
    await this.audit(porteur3, 'PROJECT_SUBMIT', 'PROJECT', projetD.id, this.daysAgo(14));
    await this.audit(admin, 'PROJECT_PUBLISH', 'PROJECT', projetD.id, this.daysAgo(12));
    await this.audit(admin, 'PROJECT_PUBLISH', 'PROJECT', projetE.id, this.daysAgo(20));
    await this.audit(admin, 'PROJECT_COLLECTE_ECHEC', 'PROJECT', projetF.id, this.daysAgo(50));
    await this.audit(admin, 'PROJECT_PUBLISH', 'PROJECT', projetG.id, this.daysAgo(55));
    this.logger.log('✅ 7 projets créés (brouillon → annonce → collectes → financé → exploitation → échec remboursé)');

    // ════════════════════════════════════════════════════════════════════════
    // 5. WALLETS — investisseurs, techniques projet, frais & séquestres.
    //    Les soldes restent à 0 ici : ils seront posés depuis le grand livre.
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('💰 Création des wallets...');

    const creerWallet = (init: Partial<WalletEntity>): Promise<WalletEntity> =>
      this.walletRepo.save(this.walletRepo.create({ devise: 'EUR', solde: 0, soldeBloque: 0, ...init }));

    const wInv1 = await creerWallet({ type: WalletType.INVESTISSEUR, proprietaireUserId: uInv1.userId, fournisseurRef: `INV-${uInv1.userId}` });
    const wInv2 = await creerWallet({ type: WalletType.INVESTISSEUR, proprietaireUserId: uInv2.userId, fournisseurRef: `INV-${uInv2.userId}` });
    const wInv3 = await creerWallet({ type: WalletType.INVESTISSEUR, proprietaireUserId: uInv3.userId, fournisseurRef: `INV-${uInv3.userId}` });
    // inv4 : PAS de wallet (persona « compte fraîchement inscrit »).
    const wInv5 = await creerWallet({ type: WalletType.INVESTISSEUR, proprietaireUserId: uInv5.userId, fournisseurRef: `INV-${uInv5.userId}` });
    const wInv6 = await creerWallet({ type: WalletType.INVESTISSEUR, proprietaireUserId: uInv6.userId, fournisseurRef: `INV-${uInv6.userId}` });

    const wProjetA = await creerWallet({ type: WalletType.TECHNIQUE_PROJET, projetId: projetA.id, fournisseurRef: `TECH-${projetA.id.slice(0, 8)}` });
    const wProjetC = await creerWallet({ type: WalletType.TECHNIQUE_PROJET, projetId: projetC.id, fournisseurRef: `TECH-${projetC.id.slice(0, 8)}` });
    const wProjetE = await creerWallet({ type: WalletType.TECHNIQUE_PROJET, projetId: projetE.id, fournisseurRef: `TECH-${projetE.id.slice(0, 8)}` });
    const wProjetF = await creerWallet({ type: WalletType.TECHNIQUE_PROJET, projetId: projetF.id, fournisseurRef: `TECH-${projetF.id.slice(0, 8)}` });
    const wProjetG = await creerWallet({ type: WalletType.TECHNIQUE_PROJET, projetId: projetG.id, fournisseurRef: `TECH-${projetG.id.slice(0, 8)}` });
    // Projet D (annonce) : aucun mouvement financier → pas de wallet, comme en réel.

    // Wallets système — l'angle mort historique : ils existent désormais dès le
    // seed AVEC du solde (alimentés par les distributions ci-dessous).
    const wFrais = await creerWallet({ type: WalletType.FRAIS_PLATEFORME, fournisseurRef: 'PLAT-FEES-001' });
    const wIR = await creerWallet({ type: WalletType.SEQUESTRE_IR, fournisseurRef: 'SEQUESTRE-IR' });
    const wCSG = await creerWallet({ type: WalletType.SEQUESTRE_CSG, fournisseurRef: 'SEQUESTRE-CSG' });

    const inv1: CompteInvestisseur = { user: uInv1, wallet: wInv1 };
    const inv2: CompteInvestisseur = { user: uInv2, wallet: wInv2 };
    const inv3: CompteInvestisseur = { user: uInv3, wallet: wInv3 };

    // ── Dépôts initiaux (contrepartie externe : carte via Stripe) ────────────
    await this.tx({ source: null, destination: wInv1, montant: 460_000, type: TransactionType.DEPOT, fournisseur: TransactionFournisseur.STRIPE, fournisseurRef: 'pi_seed_inv1_1', idempotencyKey: 'depot:pi_seed_inv1_1', ageJours: 90 });
    await this.tx({ source: null, destination: wInv2, montant: 262_000, type: TransactionType.DEPOT, fournisseur: TransactionFournisseur.STRIPE, fournisseurRef: 'pi_seed_inv2_1', idempotencyKey: 'depot:pi_seed_inv2_1', ageJours: 88 });
    await this.tx({ source: null, destination: wInv3, montant: 172_000, type: TransactionType.DEPOT, fournisseur: TransactionFournisseur.STRIPE, fournisseurRef: 'pi_seed_inv3_1', idempotencyKey: 'depot:pi_seed_inv3_1', ageJours: 85 });
    for (const [u, w] of [[uInv1, wInv1], [uInv2, wInv2], [uInv3, wInv3]] as const) {
      await this.audit(u, 'WALLET_DEPOSIT', 'WALLET', w.id, this.daysAgo(85));
    }
    this.logger.log('✅ Wallets + dépôts initiaux créés');

    // ════════════════════════════════════════════════════════════════════════
    // 6. PROJET A — collecte 100 %, versement porteur, 3 distributions versées
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('📈 Projet A : collecte, versement porteur, distributions...');

    // Souscriptions : inv1 (averti → directe), inv2/inv3 (non avertis →
    // blocage à J-67 puis libération à J-63, délai expiré).
    const invA1 = await this.souscrire({
      projet: projetA, walletProjet: wProjetA, investisseur: inv1,
      nbTitres: 3_000, valeurTitre: PRIX_FRACTION_A,
      statutFinal: InvestmentStatus.CONFIRME, averti: true, jourSouscription: 63,
    });
    const invA2 = await this.souscrire({
      projet: projetA, walletProjet: wProjetA, investisseur: inv2,
      nbTitres: 1_800, valeurTitre: PRIX_FRACTION_A,
      statutFinal: InvestmentStatus.CONFIRME, averti: false,
      jourSouscription: 67, jourConfirmation: 63,
    });
    const invA3 = await this.souscrire({
      projet: projetA, walletProjet: wProjetA, investisseur: inv3,
      nbTitres: 1_200, valeurTitre: PRIX_FRACTION_A,
      statutFinal: InvestmentStatus.CONFIRME, averti: false,
      jourSouscription: 67, jourConfirmation: 63,
    });
    for (const [c, inv] of [[inv1, invA1], [inv2, invA2], [inv3, invA3]] as const) {
      await this.audit(c.user, 'INVESTMENT_CREATE', 'INVESTMENT', inv.id, inv.createdAt);
      await this.audit(c.user, 'INVESTMENT_SIGN', 'INVESTMENT', inv.id, inv.createdAt);
    }
    await this.audit(admin, 'PROJECT_FUNDED_100', 'PROJECT', projetA.id, this.daysAgo(60));

    // Versement au porteur : la collecte est mise à disposition (hors
    // plateforme) — 590 000 €, le reliquat couvre les premiers flux.
    await this.verserPorteur({
      projet: projetA, walletProjet: wProjetA, montant: 590_000,
      reference: 'VIR-2026-RLJ-001', declarePar: admin, ageJours: 55,
      commentaire: 'Mise à disposition de la collecte — acquisition du bien.',
    });
    await this.audit(admin, 'PORTEUR_VERSEMENT_DECLARE', 'PROJECT', projetA.id, this.daysAgo(55));

    // ── Gestion locative du projet A ─────────────────────────────────────────
    const uniteA = await this.uniteRepo.save(
      this.uniteRepo.create({
        projetId: projetA.id,
        reference: 'RLJ-IMMEUBLE',
        surfaceM2: 420,
        loyerMensuelCible: LOYER_A,
      }),
    );
    const locataireA = await this.locataireRepo.save(
      this.locataireRepo.create({
        nomComplet: 'Cabinet Diop & Associés',
        email: 'contact@diop-associes.sn',
        telephone: '+221 33 821 00 00',
        spvId: spvA.id,
      }),
    );
    const bailA = await this.bailRepo.save(
      this.bailRepo.create({
        uniteLouableId: uniteA.id,
        locataireId: locataireA.id,
        loyerMensuel: LOYER_A,
        dateDebut: this.daysAgo(95),
        dateFin: null,
        statut: StatutBail.ACTIF,
        contratPdfUrl: null,
      }),
    );

    // ── 3 périodes VERSÉES (M-3, M-2, M-1) : IR 12,8 % + CSG 17,2 % + frais
    //    plateforme NON NULS — même calcul que CalculateDistributionPeriode
    //    (frais depuis la grille par défaut), même forme d'écritures que
    //    ExecuteDistributionUseCase. Après seed, les wallets sequestre_ir,
    //    sequestre_csg et frais_plateforme portent du solde.
    const fraisAnnuelMensuel = round2(
      (CAPITAL_A * (DEFAULT_FEE_RATES.annualPlatformFeePct / 100)) / 12,
    ); // 500 €
    const fraisGestion = round2(
      LOYER_A * (DEFAULT_FEE_RATES.rentManagementFeePct / 100),
    ); // 315 €
    const revenuNetA = round2(LOYER_A - fraisAnnuelMensuel - fraisGestion); // 3 685 €

    const partsA: Array<{ compte: CompteInvestisseur; investissement: InvestmentEntity; nbTitres: number }> = [
      { compte: inv1, investissement: invA1, nbTitres: 3_000 },
      { compte: inv2, investissement: invA2, nbTitres: 1_800 },
      { compte: inv3, investissement: invA3, nbTitres: 1_200 },
    ];

    let totalIRVerse = 0;
    let totalCSGVerse = 0;
    for (const [index, monthOffset] of [-3, -2, -1].entries()) {
      const periodeLabel = this.periode(monthOffset);
      const jourDistribution = [66, 36, 6][index];
      const jourLoyer = jourDistribution + 4;

      // Loyer déclaré par le porteur puis validé par l'admin.
      await this.loyerRepo.save(
        this.loyerRepo.create({
          bailId: bailA.id,
          periode: periodeLabel,
          montant: LOYER_A,
          dateEncaissement: this.daysAgo(jourLoyer),
          preuves: [`recu-loyer-${periodeLabel}.pdf`],
          statut: StatutDeclaration.VALIDE,
          declareParUserId: porteur1.userId,
          valideParUserId: admin.userId,
          valideLe: this.daysAgo(jourLoyer - 2),
          motifRejet: null,
        }),
      );
      await this.audit(porteur1, 'LOYER_DECLARE', 'LOYER', bailA.id, this.daysAgo(jourLoyer));
      await this.audit(admin, 'LOYER_VALIDATE', 'LOYER', bailA.id, this.daysAgo(jourLoyer - 2));

      // Le porteur alimente le projet à hauteur du loyer encaissé (carte).
      await this.apportPorteur({
        projet: projetA, walletProjet: wProjetA, montant: LOYER_A,
        paymentIntentId: `pi_seed_rlj_${periodeLabel}`, porteur: porteur1,
        ageJours: jourDistribution + 1,
      });

      // Période calculée → validée → distribuée.
      const periodeDist = await this.periodeRepo.save(
        this.periodeRepo.create({
          projetId: projetA.id,
          periode: periodeLabel,
          totalLoyers: LOYER_A,
          totalCharges: round2(fraisAnnuelMensuel + fraisGestion),
          revenuNet: revenuNetA,
          fraisPlateformeAnnuel: fraisAnnuelMensuel,
          fraisGestionLocative: fraisGestion,
          fraisPlafonnes: false,
          statut: StatutPeriodeDistribution.DISTRIBUEE,
          calculeeLe: this.daysAgo(jourDistribution + 1),
          valideeLe: this.daysAgo(jourDistribution + 1),
          distribueeLe: this.daysAgo(jourDistribution),
          createdAt: this.daysAgo(jourDistribution + 1),
        }),
      );
      await this.audit(admin, 'equity.distribution.execute', 'periode_distribution', periodeDist.id, this.daysAgo(jourDistribution));

      // Frais plateforme — encaissés à l'exécution, une écriture par frais.
      await this.tx({
        source: wProjetA, destination: wFrais, montant: fraisAnnuelMensuel,
        type: TransactionType.FRAIS, projetId: projetA.id,
        idempotencyKey: `distribution:fee:plateforme_annuel:${periodeDist.id}`,
        metadata: { source: 'plateforme_annuel', periodeDistributionId: periodeDist.id, periode: periodeLabel, capped: false },
        ageJours: jourDistribution,
      });
      await this.tx({
        source: wProjetA, destination: wFrais, montant: fraisGestion,
        type: TransactionType.FRAIS, projetId: projetA.id,
        idempotencyKey: `distribution:fee:gestion_locative:${periodeDist.id}`,
        metadata: { source: 'gestion_locative', periodeDistributionId: periodeDist.id, periode: periodeLabel, totalLoyers: LOYER_A, capped: false },
        ageJours: jourDistribution,
      });

      // Parts au prorata des fractions + net/IR/CSG (parité usecase calcul).
      for (const { compte, investissement, nbTitres } of partsA) {
        const pourcentage = nbTitres / NB_FRACTIONS_A;
        const brut = round2(revenuNetA * pourcentage);
        const ir = round2(brut * TAUX_IR);
        const csg = round2(brut * TAUX_CSG);
        const net = round2(brut - ir - csg);
        totalIRVerse = round2(totalIRVerse + ir);
        totalCSGVerse = round2(totalCSGVerse + csg);

        const part = await this.distributionPartRepo.save(
          this.distributionPartRepo.create({
            periodeDistributionId: periodeDist.id,
            investissementId: investissement.id,
            pourcentageDetention: Math.round(pourcentage * 1e8) / 1e8,
            montantBrut: brut,
            prelevementIR: ir,
            prelevementCSG: csg,
            montantNet: net,
            payeLe: this.daysAgo(jourDistribution),
            createdAt: this.daysAgo(jourDistribution + 1),
          }),
        );

        await this.tx({
          source: wProjetA, destination: compte.wallet, montant: net,
          type: TransactionType.PAIEMENT_INTERETS,
          investissementId: investissement.id, projetId: projetA.id,
          idempotencyKey: `distribution:net:${part.id}`,
          ageJours: jourDistribution,
        });
        await this.tx({
          source: wProjetA, destination: wIR, montant: ir,
          type: TransactionType.IMPOTS,
          investissementId: investissement.id, projetId: projetA.id,
          idempotencyKey: `distribution:ir:${part.id}`,
          ageJours: jourDistribution,
        });
        await this.tx({
          source: wProjetA, destination: wCSG, montant: csg,
          type: TransactionType.IMPOTS,
          investissementId: investissement.id, projetId: projetA.id,
          idempotencyKey: `distribution:csg:${part.id}`,
          ageJours: jourDistribution,
        });

        await this.notifier(
          compte.user.userId,
          NotificationType.ECHEANCE,
          'Revenus locatifs versés',
          `${net.toLocaleString('fr-FR')} € nets vous ont été versés pour « ${projetA.titre} » au titre de la période ${periodeLabel}.`,
          { projetId: projetA.id, periodeDistributionId: periodeDist.id, periode: periodeLabel, montantNet: net },
          { lu: index < 2, ageJours: jourDistribution },
        );
      }
    }

    // Loyer du mois courant : déclaré par le porteur, EN ATTENTE de validation.
    const periodeCouranteA = this.periode(0);
    await this.loyerRepo.save(
      this.loyerRepo.create({
        bailId: bailA.id,
        periode: periodeCouranteA,
        montant: LOYER_A,
        dateEncaissement: this.daysAgo(2),
        preuves: [`recu-loyer-${periodeCouranteA}.pdf`],
        statut: StatutDeclaration.DECLARE,
        declareParUserId: porteur1.userId,
        valideParUserId: null,
        valideLe: null,
        motifRejet: null,
      }),
    );
    await this.audit(porteur1, 'LOYER_DECLARE', 'LOYER', bailA.id, this.daysAgo(2));

    // Sortie projetée (cession du bien à l'étude) → écran « sortie » non vide.
    await this.sortieRepo.save(
      this.sortieRepo.create({
        projetId: projetA.id,
        prixRevente: 690_000,
        dateRevente: this.daysAhead(75),
        plusValueBrute: 90_000,
        statut: StatutSortie.PROJETEE,
        acteVentePdfUrl: null,
      }),
    );

    this.logger.log(
      `✅ Projet A : 3 distributions versées — IR séquestré ${totalIRVerse.toLocaleString('fr-FR')} €, CSG ${totalCSGVerse.toLocaleString('fr-FR')} €`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // 7. PROJET C — souscription obligataire partielle + échéancier de coupons
    // ════════════════════════════════════════════════════════════════════════
    const invC1 = await this.souscrire({
      projet: projetC, walletProjet: wProjetC, investisseur: inv1,
      nbTitres: 20, valeurTitre: 500,
      statutFinal: InvestmentStatus.CONFIRME, averti: true, jourSouscription: 8,
    });
    // Échéancier in fine : coupon mensuel, capital remboursé à la dernière.
    const couponMensuel = round2((10_000 * 8.5) / 100 / 12); // 70,83 €
    const echeancesC: Partial<EcheanceEntity>[] = [];
    for (let i = 1; i <= 24; i++) {
      const datePrevue = new Date(this.daysAgo(8));
      datePrevue.setMonth(datePrevue.getMonth() + i);
      echeancesC.push({
        investissementId: invC1.id,
        numero: i,
        datePrevue,
        montantCapital: i === 24 ? 10_000 : 0,
        montantInterets: couponMensuel,
        montantTotal: round2((i === 24 ? 10_000 : 0) + couponMensuel),
        statut: EcheanceStatus.A_VENIR,
        payeLe: null,
      });
    }
    await this.echeanceRepo.save(this.echeanceRepo.create(echeancesC));
    this.logger.log('✅ Projet C : 10 000 € souscrits (obligation), 24 échéances générées');

    // ════════════════════════════════════════════════════════════════════════
    // 8. PROJET E — collecte partielle (37 000 / 450 000 €) + délai en cours
    // ════════════════════════════════════════════════════════════════════════
    await this.souscrire({
      projet: projetE, walletProjet: wProjetE, investisseur: inv1,
      nbTitres: 300, valeurTitre: 100,
      statutFinal: InvestmentStatus.CONFIRME, averti: true, jourSouscription: 12,
    });
    await this.souscrire({
      projet: projetE, walletProjet: wProjetE, investisseur: inv2,
      nbTitres: 50, valeurTitre: 100,
      statutFinal: InvestmentStatus.CONFIRME, averti: false,
      jourSouscription: 10, jourConfirmation: 6,
    });
    // inv3 : souscription d'HIER, encore sous délai de réflexion — fonds
    // bloqués sur SON wallet (soldeBloque > 0), rien n'est acquis au projet.
    await this.souscrire({
      projet: projetE, walletProjet: wProjetE, investisseur: inv3,
      nbTitres: 20, valeurTitre: 100,
      statutFinal: InvestmentStatus.EN_DELAI_RETRACTATION, averti: false,
      jourSouscription: 1, delaiJusquAu: this.daysAhead(3),
    });
    this.logger.log('✅ Projet E : 35 000 € acquis + 2 000 € en délai de réflexion');

    // ════════════════════════════════════════════════════════════════════════
    // 9. PROJET F — collecte échouée, remboursée intégralement
    // ════════════════════════════════════════════════════════════════════════
    const invF2 = await this.souscrire({
      projet: projetF, walletProjet: wProjetF, investisseur: inv2,
      nbTitres: 100, valeurTitre: 100,
      statutFinal: InvestmentStatus.CONFIRME, averti: false,
      jourSouscription: 70, jourConfirmation: 66,
    });
    const invF3 = await this.souscrire({
      projet: projetF, walletProjet: wProjetF, investisseur: inv3,
      nbTitres: 80, valeurTitre: 100,
      statutFinal: InvestmentStatus.CONFIRME, averti: false,
      jourSouscription: 70, jourConfirmation: 66,
    });
    // Remboursement « tout ou rien » — même forme que RefundCollecteService.
    for (const [compte, inv] of [[inv2, invF2], [inv3, invF3]] as const) {
      await this.tx({
        source: wProjetF, destination: compte.wallet, montant: Number(inv.montant),
        type: TransactionType.REMBOURSEMENT_COLLECTE_ECHEC,
        investissementId: inv.id, projetId: projetF.id,
        idempotencyKey: `refund-collecte:${inv.id}`,
        metadata: { reason: 'Objectif minimum non atteint à la clôture', triggeredBy: 'system', enDelaiReflexion: false },
        ageJours: 50,
      });
      await this.investmentRepo.update({ id: inv.id }, { statut: InvestmentStatus.ANNULE });
      await this.notifier(
        compte.user.userId,
        NotificationType.AUTRE,
        `Collecte non aboutie : ${projetF.titre}`,
        `L'objectif de collecte n'a pas été atteint. Votre engagement de ${Number(inv.montant).toLocaleString('fr-FR')} € vous a été intégralement restitué.`,
        { projetId: projetF.id, investissementId: inv.id },
        { lu: true, ageJours: 50 },
      );
    }
    this.logger.log('✅ Projet F : collecte échouée, 18 000 € remboursés (wallet projet à 0)');

    // ════════════════════════════════════════════════════════════════════════
    // 10. PROJET G — collecte 100 %, loyers déclarés, versement porteur
    // ════════════════════════════════════════════════════════════════════════
    await this.souscrire({
      projet: projetG, walletProjet: wProjetG, investisseur: inv1,
      nbTitres: 1_000, valeurTitre: 100,
      statutFinal: InvestmentStatus.CONFIRME, averti: true, jourSouscription: 45,
    });
    await this.souscrire({
      projet: projetG, walletProjet: wProjetG, investisseur: inv2,
      nbTitres: 600, valeurTitre: 100,
      statutFinal: InvestmentStatus.CONFIRME, averti: false,
      jourSouscription: 46, jourConfirmation: 42,
    });
    await this.souscrire({
      projet: projetG, walletProjet: wProjetG, investisseur: inv3,
      nbTitres: 400, valeurTitre: 100,
      statutFinal: InvestmentStatus.CONFIRME, averti: false,
      jourSouscription: 46, jourConfirmation: 42,
    });
    await this.audit(admin, 'PROJECT_FUNDED_100', 'PROJECT', projetG.id, this.daysAgo(42));

    // Versement au porteur (constat manuel) puis apport pour couvrir la
    // prochaine distribution — le porteur3 a une trésorerie lisible.
    await this.verserPorteur({
      projet: projetG, walletProjet: wProjetG, montant: 195_000,
      reference: 'VIR-2026-FLB-001', declarePar: admin, ageJours: 30,
      commentaire: 'Mise à disposition de la collecte — acquisition des deux lots.',
    });
    await this.apportPorteur({
      projet: projetG, walletProjet: wProjetG, montant: 4_200,
      paymentIntentId: 'pi_seed_flb_1', porteur: porteur3, ageJours: 8,
    });

    // Gestion locative : 2 unités, 2 locataires réunionnais, 2 baux actifs.
    const unitesG = await this.uniteRepo.save([
      this.uniteRepo.create({ projetId: projetG.id, reference: 'FLB-A1', surfaceM2: 68, loyerMensuelCible: 1_500 }),
      this.uniteRepo.create({ projetId: projetG.id, reference: 'FLB-A2', surfaceM2: 52, loyerMensuelCible: 1_300 }),
    ]);
    const locatairesG = await this.locataireRepo.save([
      this.locataireRepo.create({ nomComplet: 'Émeline Fontaine', email: 'emeline.fontaine@exemple.re', telephone: '+262 692 11 22 33', spvId: spvG.id }),
      this.locataireRepo.create({ nomComplet: 'Teddy Rivière', email: 'teddy.riviere@exemple.re', telephone: '+262 693 44 55 66', spvId: spvG.id }),
    ]);
    const bauxG = await this.bailRepo.save([
      this.bailRepo.create({ uniteLouableId: unitesG[0].id, locataireId: locatairesG[0].id, loyerMensuel: 1_500, dateDebut: this.daysAgo(35), dateFin: null, statut: StatutBail.ACTIF, contratPdfUrl: null }),
      this.bailRepo.create({ uniteLouableId: unitesG[1].id, locataireId: locatairesG[1].id, loyerMensuel: 1_300, dateDebut: this.daysAgo(35), dateFin: null, statut: StatutBail.ACTIF, contratPdfUrl: null }),
    ]);

    // Loyers M-1 VALIDÉS (prêts pour une distribution réelle) + M courant
    // DÉCLARÉS (en attente admin) ; une charge validée + une déclarée.
    const periodeGValidee = this.periode(-1);
    const periodeGCourante = this.periode(0);
    for (const [i, bail] of bauxG.entries()) {
      await this.loyerRepo.save(
        this.loyerRepo.create({
          bailId: bail.id,
          periode: periodeGValidee,
          montant: Number(bail.loyerMensuel),
          dateEncaissement: this.daysAgo(9),
          preuves: [`quittance-${periodeGValidee}-${i + 1}.pdf`],
          statut: StatutDeclaration.VALIDE,
          declareParUserId: porteur3.userId,
          valideParUserId: admin.userId,
          valideLe: this.daysAgo(7),
          motifRejet: null,
        }),
      );
      await this.loyerRepo.save(
        this.loyerRepo.create({
          bailId: bail.id,
          periode: periodeGCourante,
          montant: Number(bail.loyerMensuel),
          dateEncaissement: this.daysAgo(1),
          preuves: [`quittance-${periodeGCourante}-${i + 1}.pdf`],
          statut: StatutDeclaration.DECLARE,
          declareParUserId: porteur3.userId,
          valideParUserId: null,
          valideLe: null,
          motifRejet: null,
        }),
      );
    }
    await this.chargeRepo.save([
      this.chargeRepo.create({
        projetId: projetG.id,
        type: TypeCharge.MAINTENANCE,
        description: 'Entretien VMC et reprise joint de douche — FLB-A1',
        montant: 250,
        periode: periodeGValidee,
        dateOperation: this.daysAgo(12),
        justificatifs: ['facture-vmc.pdf'],
        statut: StatutDeclaration.VALIDE,
        declareParUserId: porteur3.userId,
        valideParUserId: admin.userId,
        valideLe: this.daysAgo(7),
        motifRejet: null,
      }),
      this.chargeRepo.create({
        projetId: projetG.id,
        type: TypeCharge.ASSURANCE,
        description: 'Assurance PNO — quote-part mensuelle',
        montant: 120,
        periode: periodeGCourante,
        dateOperation: this.daysAgo(1),
        justificatifs: [],
        statut: StatutDeclaration.DECLARE,
        declareParUserId: porteur3.userId,
        valideParUserId: null,
        valideLe: null,
        motifRejet: null,
      }),
    ]);
    await this.audit(porteur3, 'LOYER_DECLARE', 'LOYER', bauxG[0].id, this.daysAgo(9));
    await this.audit(admin, 'LOYER_VALIDATE', 'LOYER', bauxG[0].id, this.daysAgo(7));
    this.logger.log(
      `✅ Projet G : loyers ${periodeGValidee} validés (2 800 €), charge validée — distribution RÉELLE jouable par l'admin (wallet projet : 9 200 €)`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // 11. MARCHÉ SECONDAIRE — annonces, marque d'intérêt, cession exécutée
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('🔁 Marché secondaire...');

    // Cession EXÉCUTÉE (historique) : inv3 a cédé 100 parts du projet A à
    // inv1 au prix unitaire de 110 € (plus-value 10 €/part).
    const CESSION_NB = 100;
    const CESSION_PRIX = 110;
    const cessionMontant = round2(CESSION_NB * CESSION_PRIX); // 11 000 €
    const cessionCoutAcquisition = round2(CESSION_NB * PRIX_FRACTION_A); // 10 000 €
    const cessionPlusValue = round2(cessionMontant - cessionCoutAcquisition); // 1 000 €
    const cessionFeeTransaction = round2(
      cessionMontant * (DEFAULT_FEE_RATES.resaleTransactionFeePct / 100),
    ); // 110 €
    const cessionFeeGain = round2(
      cessionPlusValue * (DEFAULT_FEE_RATES.shareSaleGainFeePct / 100),
    ); // 150 €
    const cessionFrais = round2(cessionFeeTransaction + cessionFeeGain); // 260 €

    const ordreExecute = await this.ordreRepo.save(
      this.ordreRepo.create({
        investissementId: invA3.id,
        vendeurId: uInv3.userId,
        acheteurId: uInv1.userId,
        sens: OrdreMarcheSens.VENTE,
        nbFractions: CESSION_NB,
        montant: cessionMontant,
        prixUnitaire: CESSION_PRIX,
        statut: OrdreMarcheStatus.EXECUTE,
        interetNbFractions: CESSION_NB,
        interetExprimeLe: this.daysAgo(8),
        accepteLe: this.daysAgo(4),
        valideJusquAu: this.daysAhead(20),
        createdAt: this.daysAgo(9),
      }),
    );
    const signatureCessionId = crypto.randomUUID();
    await this.signatureRepo.save(
      this.signatureRepo.create({
        id: signatureCessionId,
        youSignRequestId: `ysr_${crypto.randomUUID().slice(0, 12)}`,
        youSignSignerId: `yss_${crypto.randomUUID().slice(0, 12)}`,
        youSignSigningUrl: null,
        documentId: crypto.randomUUID(),
        investmentId: null, // cas B : l'acheteur n'avait pas d'investissement lié
        ordreId: ordreExecute.id,
        nbFractions: CESSION_NB,
        userId: uInv1.userId,
        statut: SignatureStatus.SIGNED,
        expiresAt: this.daysAhead(11),
        signedAt: this.daysAgo(3),
        createdAt: this.daysAgo(4),
      } as Partial<SignatureEntity>),
    );

    // Position vendeur réduite au coût d'acquisition ; investissement acheteur
    // créé au prix de cession (parité règlement YouSignWebhookController).
    invA3.nbTitres = 1_100;
    invA3.montant = 110_000;
    await this.investmentRepo.save(invA3);
    const invA1Rachat = await this.investmentRepo.save(
      this.investmentRepo.create({
        projetId: projetA.id,
        utilisateurId: uInv1.userId,
        montant: cessionMontant,
        instrument: projetA.instrument,
        nbTitres: CESSION_NB,
        valeurTitre: CESSION_PRIX,
        statut: InvestmentStatus.CONFIRME,
        signatureId: signatureCessionId,
        createdAt: this.daysAgo(3),
      }),
    );

    // Écritures du règlement, alignées sur le règlement de production
    // (settle-cession) : paiement complet acheteur→vendeur, puis frais
    // vendeur→plateforme — mêmes clés, mêmes metadata, `rapprocherGrandLivre`
    // sort à zéro. (Le règlement de production a historiquement écrit une
    // ligne « net vendeur » à source NULL qui sur-créditait le registre du
    // vendeur ; corrigé au lot 1 — le seed et la prod écrivent désormais la
    // même version équilibrée.)
    await this.tx({
      source: wInv1, destination: wInv3, montant: cessionMontant,
      type: TransactionType.SOUSCRIPTION,
      investissementId: invA1Rachat.id, projetId: projetA.id,
      idempotencyKey: `rachat:buyer:${signatureCessionId}`,
      fraisPlateforme: cessionFrais,
      ageJours: 3,
    });
    await this.tx({
      source: wInv3, destination: wFrais, montant: cessionFeeTransaction,
      type: TransactionType.SOUSCRIPTION,
      investissementId: invA3.id, projetId: projetA.id,
      idempotencyKey: `secmarket:fee:revente_transaction:sig:${signatureCessionId}`,
      metadata: { source: 'revente_transaction', ordreId: ordreExecute.id, signatureId: signatureCessionId },
      ageJours: 3,
    });
    await this.tx({
      source: wInv3, destination: wFrais, montant: cessionFeeGain,
      type: TransactionType.SOUSCRIPTION,
      investissementId: invA3.id, projetId: projetA.id,
      idempotencyKey: `secmarket:fee:gain_revente_actions:sig:${signatureCessionId}`,
      metadata: {
        source: 'gain_revente_actions', ordreId: ordreExecute.id,
        signatureId: signatureCessionId,
        plusValueVendeur: cessionPlusValue, coutAcquisition: cessionCoutAcquisition,
      },
      ageJours: 3,
    });
    await this.notifier(
      uInv3.userId, NotificationType.MARCHE_SECONDAIRE,
      'Cession exécutée',
      `Votre cession de ${CESSION_NB} parts « ${projetA.titre} » a été réglée : ${round2(cessionMontant - cessionFrais).toLocaleString('fr-FR')} € nets crédités.`,
      { ordreId: ordreExecute.id }, { lu: false, ageJours: 3 },
    );
    await this.notifier(
      uInv1.userId, NotificationType.MARCHE_SECONDAIRE,
      'Achat de parts confirmé',
      `Vous détenez ${CESSION_NB} parts supplémentaires de « ${projetA.titre} » (contrat de cession signé).`,
      { ordreId: ordreExecute.id }, { lu: false, ageJours: 3 },
    );

    // Annonces vivantes : 2 EN_CARNET à prix variés + 1 INTERET_EXPRIME.
    await this.ordreRepo.save(
      this.ordreRepo.create({
        investissementId: invA1.id,
        vendeurId: uInv1.userId,
        sens: OrdreMarcheSens.VENTE,
        nbFractions: 200,
        montant: 21_000,
        prixUnitaire: 105,
        statut: OrdreMarcheStatus.EN_CARNET,
        valideJusquAu: this.daysAhead(30),
        createdAt: this.daysAgo(5),
      }),
    );
    await this.ordreRepo.save(
      this.ordreRepo.create({
        investissementId: invA3.id,
        vendeurId: uInv3.userId,
        sens: OrdreMarcheSens.VENTE,
        nbFractions: 150,
        montant: 15_300,
        prixUnitaire: 102,
        statut: OrdreMarcheStatus.EN_CARNET,
        valideJusquAu: this.daysAhead(25),
        createdAt: this.daysAgo(2),
      }),
    );
    const ordreInteret = await this.ordreRepo.save(
      this.ordreRepo.create({
        investissementId: invA2.id,
        vendeurId: uInv2.userId,
        acheteurId: uInv1.userId,
        sens: OrdreMarcheSens.VENTE,
        nbFractions: 300,
        montant: 29_400,
        prixUnitaire: 98,
        statut: OrdreMarcheStatus.INTERET_EXPRIME,
        interetNbFractions: 150,
        interetExprimeLe: this.daysAgo(1),
        valideJusquAu: this.daysAhead(20),
        createdAt: this.daysAgo(6),
      }),
    );
    await this.notifier(
      uInv2.userId, NotificationType.MARCHE_SECONDAIRE,
      'Un investisseur est intéressé par votre annonce',
      `Un investisseur souhaite acquérir 150 fraction(s) au prix que vous avez indiqué (14 700 € au total). La cession n'aura lieu que si vous l'acceptez.`,
      { ordreId: ordreInteret.id }, { lu: false, ageJours: 1 },
    );
    this.logger.log('✅ Marché secondaire : 2 annonces en carnet, 1 intérêt exprimé, 1 cession exécutée');

    // ════════════════════════════════════════════════════════════════════════
    // 12. RÉSERVATIONS (projet D en annonce, pré-investissable)
    // ════════════════════════════════════════════════════════════════════════
    await this.reservationRepo.save([
      this.reservationRepo.create({
        projetId: projetD.id, utilisateurId: uInv1.userId,
        montantReserve: 5_000, rangFile: 1,
        statut: ReservationStatus.VALIDEE,
        confirmationJusquAu: null, investissementId: null,
        createdAt: this.daysAgo(9),
      }),
      this.reservationRepo.create({
        projetId: projetD.id, utilisateurId: uInv2.userId,
        montantReserve: 3_000, rangFile: 2,
        statut: ReservationStatus.EN_ATTENTE,
        confirmationJusquAu: null, investissementId: null,
        createdAt: this.daysAgo(7),
      }),
      this.reservationRepo.create({
        projetId: projetD.id, utilisateurId: uInv3.userId,
        montantReserve: 1_500, rangFile: 3,
        statut: ReservationStatus.EN_ATTENTE,
        confirmationJusquAu: null, investissementId: null,
        createdAt: this.daysAgo(4),
      }),
    ]);
    await this.notifier(
      uInv1.userId, NotificationType.NOUVEAU_PROJET,
      'Réservation confirmée',
      `Votre réservation de 5 000 € sur « ${projetD.titre} » est validée — rang 1 dans la file.`,
      { projetId: projetD.id }, { lu: true, ageJours: 8 },
    );
    this.logger.log('✅ Réservations : 3 sur « Résidence Océane » (9 500 € / plafond 100 000 €)');

    // ════════════════════════════════════════════════════════════════════════
    // 13. RETRAITS & mouvements de wallet complémentaires
    // ════════════════════════════════════════════════════════════════════════
    // Retrait RÉUSSI (inv2) — arrivé en banque via Stripe Connect.
    await this.tx({
      source: wInv2, destination: null, montant: 1_500,
      type: TransactionType.RETRAIT,
      fournisseur: TransactionFournisseur.STRIPE,
      idempotencyKey: `retrait:${uInv2.userId}:${crypto.randomUUID()}`,
      metadata: {
        method: 'stripe_connect', userId: uInv2.userId,
        transferId: 'tr_seed_inv2_1', payoutId: 'po_seed_inv2_1', payoutMethod: 'standard',
      },
      ageJours: 15,
    });
    await this.notifier(
      uInv2.userId, NotificationType.RETRAIT_TRAITE,
      'Retrait effectué',
      'Votre retrait de 1 500 € est arrivé sur votre compte bancaire.',
      {}, { lu: true, ageJours: 14 },
    );
    // Retrait EN COURS (inv3) — débité à la demande, en vol chez le PSP.
    await this.tx({
      source: wInv3, destination: null, montant: 2_000,
      type: TransactionType.RETRAIT,
      statut: TransactionStatus.EN_COURS,
      fournisseur: TransactionFournisseur.STRIPE,
      idempotencyKey: `retrait:${uInv3.userId}:${crypto.randomUUID()}`,
      metadata: {
        method: 'stripe_connect', userId: uInv3.userId, transferId: 'tr_seed_inv3_1',
      },
      ageJours: 0,
    });
    // Dépôt ÉCHOUÉ (inv3) — ligne d'historique, aucun solde touché.
    await this.tx({
      source: null, destination: wInv3, montant: 3_000,
      type: TransactionType.DEPOT,
      statut: TransactionStatus.ECHOUE,
      fournisseur: TransactionFournisseur.STRIPE,
      fournisseurRef: 'pi_seed_inv3_ko',
      idempotencyKey: 'depot:pi_seed_inv3_ko',
      motifEchec: 'Carte refusée par l’émetteur (card_declined)',
      ageJours: 2,
    });
    // Dépôt d'appoint récent (inv1).
    await this.tx({
      source: null, destination: wInv1, montant: 5_000,
      type: TransactionType.DEPOT,
      fournisseur: TransactionFournisseur.STRIPE,
      fournisseurRef: 'pi_seed_inv1_2',
      idempotencyKey: 'depot:pi_seed_inv1_2',
      ageJours: 4,
    });
    this.logger.log('✅ Retraits : 1 réussi (inv2), 1 en cours (inv3) + 1 dépôt échoué');

    // ════════════════════════════════════════════════════════════════════════
    // 14. RÉCLAMATIONS, AVIS, ACTUALITÉS, NOTIFICATIONS DIVERSES
    // ════════════════════════════════════════════════════════════════════════
    const recues: Array<{
      u: UserEntity; cat: CategorieReclamation; objet: string; description: string;
      statut: StatutReclamation; ageJours: number; projetId?: string;
      reponse?: string; ageReponse?: number; ageAccuse?: number; seq: number;
    }> = [
      {
        u: uInv2, cat: CategorieReclamation.FLUX_FINANCIERS, seq: 1,
        objet: 'Distribution de loyers non comprise',
        description: 'Le montant net versé ce mois-ci diffère du montant brut annoncé sur la fiche projet. Merci de détailler les prélèvements appliqués.',
        statut: StatutReclamation.RESOLUE, ageJours: 40, projetId: projetA.id,
        reponse: 'Le net versé correspond au brut diminué des prélèvements à la source : IR 12,8 % et prélèvements sociaux 17,2 %, ainsi que des frais de plateforme détaillés dans la section « Frais » du document d’informations clés. Le relevé de la période est disponible dans votre espace.',
        ageReponse: 25, ageAccuse: 38,
      },
      {
        u: uInv1, cat: CategorieReclamation.INFORMATION_PROJET, seq: 1,
        objet: 'Photos manquantes sur la Résidence Océane',
        description: 'La fiche du projet Résidence Océane ne montre pas l’état intérieur des T3. Pouvez-vous compléter la documentation avant l’ouverture de la collecte ?',
        statut: StatutReclamation.EN_INSTRUCTION, ageJours: 6, projetId: projetD.id,
        ageAccuse: 5,
      },
      {
        u: uInv3, cat: CategorieReclamation.PLATEFORME, seq: 2,
        objet: 'Retrait affiché « en cours » depuis hier',
        description: 'Mon retrait de 2 000 € reste au statut en cours. Merci de confirmer le délai d’arrivée sur mon compte bancaire.',
        statut: StatutReclamation.RECUE, ageJours: 1,
      },
    ];
    for (const r of recues) {
      const recueLe = this.daysAgo(r.ageJours);
      await this.reclamationRepo.save(
        this.reclamationRepo.create({
          reference: genererReference(recueLe, r.seq),
          utilisateurId: r.u.userId,
          categorie: r.cat,
          objet: r.objet,
          description: r.description,
          projetId: r.projetId ?? null,
          investissementId: null,
          statut: r.statut,
          accuseReceptionLe: r.ageAccuse !== undefined ? this.daysAgo(r.ageAccuse) : null,
          reponse: r.reponse ?? null,
          reponduLe: r.ageReponse !== undefined ? this.daysAgo(r.ageReponse) : null,
          traiteParUserId: r.reponse ? admin.userId : null,
          echeanceReponse: echeanceReponse(recueLe),
          createdAt: recueLe,
        } as any),
      );
    }

    await this.avisRepo.save([
      this.avisRepo.create({ projetId: projetA.id, userId: uInv1.userId, note: 5, commentaire: 'Distributions versées chaque mois sans retard, reporting clair. Très satisfaite.', createdAt: this.daysAgo(20) }),
      this.avisRepo.create({ projetId: projetA.id, userId: uInv2.userId, note: 4, commentaire: 'Bon suivi locatif. J’aimerais plus de détail sur les charges de l’immeuble.', createdAt: this.daysAgo(18) }),
      this.avisRepo.create({ projetId: projetA.id, userId: uInv3.userId, note: 4, commentaire: 'La cession de mes parts sur le tableau d’affichage s’est faite en quelques jours.', createdAt: this.daysAgo(2) }),
      this.avisRepo.create({ projetId: projetG.id, userId: uInv1.userId, note: 5, commentaire: 'Premier projet réunionnais, dossier très complet (baux et quittances fournis).', createdAt: this.daysAgo(10) }),
      this.avisRepo.create({ projetId: projetC.id, userId: uInv1.userId, note: 3, commentaire: 'Le coupon est attractif mais j’aurais aimé un locataire diversifié.', createdAt: this.daysAgo(5) }),
    ]);

    for (const a of ACTUALITES) {
      await this.newsRepo.save(
        this.newsRepo.create({
          slug: a.slug,
          titreFr: a.titreFr,
          contenuFr: a.contenuFr,
          resumeFr: a.resumeFr,
          category: a.category,
          statut: a.publiee ? NewsStatus.PUBLISHED : NewsStatus.DRAFT,
          publishedAt: a.publiee ? this.daysAgo(a.ageJours) : null,
          authorId: marketing.userId,
          createdAt: this.daysAgo(a.ageJours + 1),
        } as any),
      );
    }

    // Notifications complémentaires (cloche non vide pour chaque persona).
    await this.notifier(uInv1.userId, NotificationType.NOUVEAU_PROJET, 'Nouveau projet en collecte', `« ${projetE.titre} » est ouvert à la souscription (objectif : 450 000 €).`, { projetId: projetE.id }, { lu: true, ageJours: 15 });
    await this.notifier(uInv2.userId, NotificationType.NOUVEAU_PROJET, 'Nouveau projet en collecte', `« ${projetE.titre} » est ouvert à la souscription (objectif : 450 000 €).`, { projetId: projetE.id }, { lu: false, ageJours: 15 });
    await this.notifier(uInv3.userId, NotificationType.NOUVEAU_PROJET, 'Nouveau projet en collecte', `« ${projetE.titre} » est ouvert à la souscription (objectif : 450 000 €).`, { projetId: projetE.id }, { lu: false, ageJours: 15 });
    await this.notifier(uInv5.userId, NotificationType.KYC_REJETE, 'Vérification d’identité refusée', 'Vos documents n’ont pas pu être validés : pièce expirée. Vous pouvez soumettre un nouveau dossier.', {}, { lu: false, ageJours: 6 });
    await this.notifier(uInv6.userId, NotificationType.KYC_REVUE_MANUELLE, 'Dossier en cours d’examen', 'Le dossier de Grondin Invest SAS est en revue manuelle par notre équipe conformité.', {}, { lu: false, ageJours: 3 });
    await this.notifier(porteur1.userId, NotificationType.ECHEANCE, 'Loyer en attente de validation', `Votre déclaration de loyer ${periodeCouranteA} (4 500 €) attend la validation de BeOwn.`, { projetId: projetA.id }, { lu: false, ageJours: 2 });
    await this.notifier(porteur3.userId, NotificationType.RETRAIT_TRAITE, 'Versement reçu', 'Le virement de 195 000 € (réf. VIR-2026-FLB-001) a été enregistré sur votre projet Les Flamboyants.', { projetId: projetG.id }, { lu: true, ageJours: 29 });
    this.logger.log('✅ Réclamations (3), avis (5), actualités (4), notifications');

    // ════════════════════════════════════════════════════════════════════════
    // 15. SOLDES & INVARIANT — les soldes sortent du grand livre, puis le
    //     rapprochement (le même que la réconciliation nocturne) est rejoué.
    // ════════════════════════════════════════════════════════════════════════
    const walletsGeres = [
      wInv1, wInv2, wInv3, wInv5, wInv6,
      wProjetA, wProjetC, wProjetE, wProjetF, wProjetG,
      wFrais, wIR, wCSG,
    ];
    for (const w of walletsGeres) {
      w.solde = this.livre.solde(w.id);
      w.soldeBloque = this.livre.soldeBloque(w.id);
      await this.walletRepo.save(w);
    }
    const ecarts = this.livre.ecarts();
    if (ecarts.length > 0) {
      this.logger.error(`Écarts de rapprochement : ${JSON.stringify(ecarts)}`);
      throw new Error(
        `Seed invalide : ${ecarts.length} wallet(s) ne se rapprochent pas de leur registre — voir le log ci-dessus.`,
      );
    }
    this.logger.log(
      `✅ Grand livre rapproché : 0 écart sur ${this.livre.nbWallets} wallets / ${this.livre.nbEcritures} écritures appliquées`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // RÉCAPITULATIF
    // ════════════════════════════════════════════════════════════════════════
    const line = '═'.repeat(72);
    const solde = (w: WalletEntity) =>
      `${this.livre.solde(w.id).toLocaleString('fr-FR')} €` +
      (this.livre.soldeBloque(w.id) > 0
        ? ` (+ ${this.livre.soldeBloque(w.id).toLocaleString('fr-FR')} € bloqués)`
        : '');
    this.logger.log(line);
    this.logger.log('✅ DATAFAKE BeOwn TERMINÉ');
    this.logger.log(line);
    this.logger.log('Comptes (mot de passe) :');
    this.logger.log(`  ADMIN         admin@beown.fr          → ${this.ADMIN_PASSWORD}`);
    this.logger.log(`  BACK-OFFICE   cio/marketing/analyste/relation/compliance/financier/`);
    this.logger.log(`                support/dpo/rcci/cgp @beown.fr → ${this.ADMIN_PASSWORD}`);
    this.logger.log(`  PORTEURS      porteur1/2/3@beown.fr   → ${this.PORTEUR_PASSWORD}`);
    this.logger.log(`  INVESTISSEURS investisseur1..8@beown.fr → ${this.INVESTISSEUR_PASSWORD}`);
    this.logger.log(line);
    this.logger.log('Investisseurs :');
    this.logger.log(`  inv1 Fatou Ndiaye     KYC validé (avertie) — wallet ${solde(wInv1)}`);
    this.logger.log(`  inv2 Ibrahima Ba      KYC validé — wallet ${solde(wInv2)} — 1 retrait réussi`);
    this.logger.log(`  inv3 Aïssatou Fall    KYC validé — wallet ${solde(wInv3)} — retrait en cours + délai de réflexion`);
    this.logger.log('  inv4 Jean-Hugues Técher  KYC NON COMMENCÉ (aucun dossier, aucun wallet) — persona gating');
    this.logger.log('  inv5 Marie Payet      KYC REFUSÉ (motif visible côté admin)');
    this.logger.log('  inv6 Grondin Invest   PM — KYC EN REVUE manuelle');
    this.logger.log("  inv7 Nadia Rivière    KYC validé — demande d'accès porteur SOUMISE (à instruire)");
    this.logger.log('  inv8 Téo Lebon        KYC validé — DOUBLE ACCÈS : investisseur + espace porteur ouvert');
    this.logger.log(line);
    this.logger.log('Projets :');
    this.logger.log('  A  Résidence Les Jardins   en_exploitation — 3 distributions versées, sortie projetée');
    this.logger.log('  B  Villas Cocody           brouillon — document d’infos clés incomplet');
    this.logger.log('  C  Bureaux Plateau         en_collecte (obligation) — 10 000 € souscrits, 24 échéances');
    this.logger.log('  D  Résidence Océane        annonce — 3 réservations (9 500 €)');
    this.logger.log('  E  Cœur de Ville           en_collecte — 35 000 € acquis + 2 000 € en délai');
    this.logger.log('  F  Les Filaos              echec — 18 000 € remboursés');
    this.logger.log('  G  Les Flamboyants         finance — loyers validés : distribution RÉELLE jouable');
    this.logger.log(line);
    this.logger.log('Wallets système :');
    this.logger.log(`  frais_plateforme  ${solde(wFrais)}   sequestre_ir  ${solde(wIR)}   sequestre_csg  ${solde(wCSG)}`);
    this.logger.log(line);
  }
}

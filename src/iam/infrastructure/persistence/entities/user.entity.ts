import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';

// Le vocabulaire du compte vit dans le domaine (iam/domains/enums/user.enum.ts).
// Ce fichier ne fait que le consommer pour typer ses colonnes.
import {
  RegimeFiscal,
  UserRole,
  UserStatus,
  UserType,
} from 'src/iam/domains/enums/user.enum';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn()
  userId: number;

  @Column({ nullable: true })
  firstname: string;

  @Column({ type: 'varchar', nullable: true })
  lastname: string | null;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  socialId: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  password: string | null;

  @Column({ type: 'varchar', default: UserRole.INVESTISSEUR })
  role: UserRole;

  @Column({ type: 'varchar', default: UserStatus.CREE })
  status: UserStatus;

  @Column({ type: 'timestamp', nullable: true })
  cguAccepteesLe: Date | null;

  // ─── Preuve de consentement CGU (lot 2 RGPD, mission 2) ──────────────────
  // Version du texte acceptée (« 1.0 » au 2026-09-03) et IP au moment de
  // l'acceptation, posées à l'inscription avec l'horodatage serveur
  // `cguAccepteesLe`. Les comptes ANTÉRIEURS au lot 2 et les comptes nés par
  // OAuth restent à NULL : AUCUN backfill — un consentement ne s'invente pas
  // (art. 7.1 RGPD). Conservation : durée du compte + 5 ans (barème lot 2,
  // docs/conformite/2026-09-03-baremes-lot2.md ligne 8).
  // Colonnes ajoutées via décorateurs + SQL manuel (ADR migrations).
  @Column({ type: 'varchar', length: 20, nullable: true })
  cguVersionAcceptee: string | null;

  // varchar(45) : une IPv6 textuelle tient en 45 caractères au maximum.
  @Column({ type: 'varchar', length: 45, nullable: true })
  cguAcceptationIp: string | null;

  // ─── Anonymisation RGPD (lot 2, mission 3) ───────────────────────────────
  // Horodatage de l'anonymisation irréversible des identifiants directs,
  // posé par AnonymizeAccountService APRÈS le soft-delete (statut SUPPRIME).
  // Double rôle :
  //  1. marqueur d'idempotence — un compte déjà anonymisé n'est jamais retraité ;
  //  2. date de « clôture de la relation d'affaires » servant de point de
  //     départ à l'archivage restreint 5 ans des données d'identité
  //     (L. 561-12 CMF), purgées ensuite par le cron RGPD.
  // Colonne ajoutée via décorateur + SQL manuel (ADR migrations).
  @Column({ type: 'timestamptz', nullable: true })
  anonymiseLe: Date | null;

  // ─── Gel des avoirs (lot 2, mission 4 — art. L. 562-4 CMF) ───────────────
  // Posé et levé UNIQUEMENT par un humain via l'endpoint admin compliance
  // dédié (GelDesAvoirsService, motif obligatoire, audité) — jamais par le
  // screening, qui ne fait que signaler. Un compte gelé ne peut plus ni
  // déposer, ni souscrire, ni retirer, ni acheter au marché secondaire
  // (403 AVOIRS_GELES) ; les crédits entrants (distributions) restent versés
  // et la purge RGPD le concernant est suspendue (barème, règle transverse 3).
  // Colonnes ajoutées via décorateurs + SQL manuel (ADR migrations).
  @Column({ type: 'timestamptz', nullable: true })
  avoirsGelesLe: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avoirsGelesMotif: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  userType: UserType | null;

  // ─── Accès porteur cumulé (lot 4 — décision fondateur D1) ────────────────
  // Un investisseur dont la demande d'accès porteur a été ACCEPTÉE conserve
  // son rôle `investisseur` et gagne ce drapeau : il entre dans l'espace
  // porteur SANS perdre son espace investisseur. Le rôle `porteur` reste,
  // lui, celui des comptes porteurs « purs » (seed, attribution directe).
  //
  // Posé/retiré UNIQUEMENT par la décision d'un instructeur sur une demande
  // (`DeciderDemandePorteurUseCase`, permission `porteur_access:review`),
  // jamais par une édition de profil. LU EN BASE à chaque requête par
  // `PorteurAccessGuard` : c'est une autorisation à état, donc révocable, et
  // le claim du JWT ne peut pas en tenir lieu (ADR rôle relu en base, § 1).
  // Colonne ajoutée via décorateur + SQL manuel (ADR migrations).
  @Column({ type: 'boolean', default: false })
  porteurAccess: boolean;

  // Date du dernier RETRAIT d'accès porteur (lot 4b) — NULL tant que l'accès
  // court, ou s'il n'a jamais été ouvert. Posée par le retrait motivé
  // (`PATCH /admin/porteur-access/acces/:userId`) et par un refus qui referme
  // un accès ouvert ; effacée à tout ré-octroi. Invariant :
  // `porteurAccess = true` ⟹ `accesRevoqueLe IS NULL`.
  //
  // Ce n'est pas une trace décorative : c'est le POINT DE DÉPART du barème de
  // conservation d'une demande ACCEPTÉE (« durée de l'accès, puis 5 ans »),
  // que la purge RGPD lit par COALESCE avec `anonymiseLe` puis `decideeLe`.
  // L'HISTORIQUE des octrois/retraits, lui, vit dans `audit_log` (5 ans, états
  // avant/après) — pas de table dédiée, pas de seconde source de vérité.
  // Colonne ajoutée via décorateur + SQL manuel (ADR migrations).
  @Column({ type: 'timestamptz', nullable: true })
  accesRevoqueLe: Date | null;

  @Column({ type: 'varchar', default: RegimeFiscal.PFU })
  regimeFiscal: RegimeFiscal;

  @Column({ type: 'decimal', precision: 4, scale: 3, nullable: true })
  tauxBaremeMarginal: number | null;

  @Column({ type: 'int', nullable: true })
  cgpId: number | null;

  @Column({ type: 'varchar', nullable: true, unique: true })
  cgpReferralCode: string | null;

  /**
   * PEP (Politically Exposed Person) — flag manuel posé par l'équipe
   * compliance après screening (vendor à brancher en Phase 10+).
   * Phase 10 stub : champ disponible, à activer via endpoint admin.
   */
  @Column({ type: 'boolean', default: false })
  pepFlagged: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  pepNote: string | null;

  // ─── Stripe Connect Express (E3 — retrait) ────────────────────────────────
  // Identifiant du compte Stripe Connect Express de l'investisseur (acct_xxx),
  // créé au premier onboarding. Sert de destination aux Transfer/Payout lors
  // d'un retrait. Nullable (créé à la demande), unique. Champ ajouté via le
  // synchronize du seed (pas de migration — cf. MEMORY schéma dev).
  @Column({ type: 'varchar', nullable: true, unique: true })
  stripeConnectAccountId: string | null;

  // Drapeaux d'état du compte connecté, rafraîchis par le webhook
  // `account.updated` et par GET /payments/connect/status. `payoutsEnabled`
  // est le garde-fou du retrait (un retrait n'est possible que si true).
  @Column({ type: 'boolean', default: false })
  stripeConnectPayoutsEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  stripeConnectChargesEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  stripeConnectDetailsSubmitted: boolean;

  // ─── Parrainage (vague C) ────────────────────────────────────────────────
  // Code personnel à partager (`BEOWN-XXXXXX`, cf. domains/code-parrainage).
  // Nullable : posé par AssurerCodeParrainageService à l'inscription (et en
  // filet à la première lecture), backfillé en SQL manuel pour le stock
  // existant (docs/adr/ADR-migrations-hors-deploiement.md).
  @Column({ type: 'varchar', length: 12, nullable: true, unique: true })
  codeParrainage: string | null;

  // Compte du parrain, figé À L'INSCRIPTION (jamais modifiable ensuite : le
  // lien de parrainage est un fait d'acquisition, pas une préférence).
  // Colonne de référence sans FK dure, comme le reste du schéma.
  @Column({ type: 'integer', nullable: true })
  parrainePar: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => UserEmailEntity, (email) => email.user, {
    cascade: true,
    eager: true,
  })
  userEmail: UserEmailEntity;

  // Les facteurs MFA appartiennent à IAM (`iam/infrastructure/persistence/
  // entities/mfa-method.entity.ts`) et pointent vers ce compte par un
  // `@ManyToOne` unidirectionnel. Le `@OneToMany mfaMethods` qui était ici
  // n'était lu par personne et forçait users à connaître les entités d'IAM.
}

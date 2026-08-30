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
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import {
  WalletType,
  TransactionType,
  TransactionStatus,
  TransactionFournisseur,
} from 'src/wallets/domains/enums/wallet.enum';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { ProfilPMEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pm.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import {
  KycStatus,
  KycNiveau,
  CategorieInvestisseur,
} from 'src/profiles/domains/enums/kyc-status.enum';
import {
  NotificationEntity,
  NotificationCanal,
} from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { AuditLogEntity } from 'src/notifications/infrastructure/persistences/entities/audit-log.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { UniteLouableEntity } from 'src/locative-management/infrastructure/persistences/entities/unite-louable.entity';
import { LocataireEntity } from 'src/locative-management/infrastructure/persistences/entities/locataire.entity';
import { BailEntity } from 'src/locative-management/infrastructure/persistences/entities/bail.entity';
import { LoyerEncaisseEntity } from 'src/locative-management/infrastructure/persistences/entities/loyer-encaisse.entity';
import { StatutBail } from 'src/locative-management/domains/enums/statut-bail.enum';
import { StatutDeclaration } from 'src/locative-management/domains/enums/statut-declaration.enum';
import { PeriodeDistributionEntity } from 'src/distributions/infrastructure/persistences/entities/periode-distribution.entity';
import { DistributionPartEntity } from 'src/distributions/infrastructure/persistences/entities/distribution-part.entity';
import { StatutPeriodeDistribution } from 'src/distributions/domains/enums/statut-periode-distribution.enum';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  DATAFAKE BeOwn — jeu de données minimal et scénarisé
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  6 utilisateurs (1 email unique chacun) :
 *    • 1 ADMIN        — supervise, valide, déclenche les virements
 *    • 2 PORTEURS     — publient des projets, déclarent les loyers
 *    • 3 INVESTISSEURS — investissent, perçoivent les distributions
 *
 *  Scénario joué de bout en bout sur le projet « Résidence Les Jardins » :
 *    1. PUBLICATION   — le porteur soumet, l'admin publie (→ en collecte)
 *    2. INVESTISSEMENT — les 3 investisseurs souscrivent
 *    3. CLÔTURE 100 % — collecte intégralement financée → projet en exploitation
 *    4. LOYER         — le porteur déclare le loyer encaissé (validé par l'admin)
 *    5. DISTRIBUTION  — l'admin valide la période puis déclenche le virement
 *                       automatique au prorata vers le wallet de chaque investisseur
 *
 *  Le seed TRONQUE les tables avant insertion → exécution idempotente, emails
 *  toujours uniques. Lancement : `npm run seed`.
 * ════════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  // Mots de passe (hachés bcrypt 12). L'admin a un secret distinct et renforcé.
  private readonly ADMIN_PASSWORD = 'Admin@BeOwn#2026!Secure';
  private readonly PORTEUR_PASSWORD = 'Porteur@2026!';
  private readonly INVESTISSEUR_PASSWORD = 'Investisseur@2026!';

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
    @InjectRepository(SpvEntity)
    private readonly spvRepo: Repository<SpvEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investmentRepo: Repository<InvestmentEntity>,
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    @InjectRepository(UniteLouableEntity)
    private readonly uniteRepo: Repository<UniteLouableEntity>,
    @InjectRepository(LocataireEntity)
    private readonly locataireRepo: Repository<LocataireEntity>,
    @InjectRepository(BailEntity)
    private readonly bailRepo: Repository<BailEntity>,
    @InjectRepository(LoyerEncaisseEntity)
    private readonly loyerRepo: Repository<LoyerEncaisseEntity>,
    @InjectRepository(PeriodeDistributionEntity)
    private readonly periodeRepo: Repository<PeriodeDistributionEntity>,
    @InjectRepository(DistributionPartEntity)
    private readonly distributionPartRepo: Repository<DistributionPartEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepo: Repository<AuditLogEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private daysAgo(n: number): Date {
    return new Date(Date.now() - n * 86_400_000);
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
  ): Promise<void> {
    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        acteurId: crypto.randomUUID(),
        role: actor.role,
        action,
        objetType,
        objetId,
        ip: '196.0.0.1',
        userAgent: 'BeOwn-Seed/1.0',
        metadata: { userId: actor.userId, email: `actor-${actor.userId}` },
      }),
    );
  }

  private async notify(
    userId: number,
    templateCode: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const canaux = Object.values(NotificationCanal);
    await this.notificationRepo.save(
      this.notificationRepo.create({
        utilisateurId: userId,
        canal: canaux[0],
        templateCode,
        statut: 'delivre',
        envoyeLe: new Date(),
        metadata,
      }),
    );
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
      'spv',
      'projet',
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
      'notification',
      'audit_log',
      'document',
      'ordre_marche',
      'avis',
      'signature',
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
    await this.reset();

    const pwdAdmin = await bcrypt.hash(this.ADMIN_PASSWORD, 12);
    const pwdPorteur = await bcrypt.hash(this.PORTEUR_PASSWORD, 12);
    const pwdInvestisseur = await bcrypt.hash(this.INVESTISSEUR_PASSWORD, 12);

    // ════════════════════════════════════════════════════════════════════════
    // 1. UTILISATEURS — 1 admin, 4 staff, 2 porteurs, 3 investisseurs
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('👥 Création des 10 utilisateurs...');

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

    const admin = await createUser(
      'Awa',
      'Diallo',
      'admin@beown.fr',
      UserRole.SUPER_ADMIN,
      pwdAdmin,
      null,
    );
    await createUser(
      'Chloé',
      'CIO',
      'cio@beown.fr',
      UserRole.CIO,
      pwdAdmin,
      null,
    );
    await createUser(
      'Marc',
      'Marketing',
      'marketing@beown.fr',
      UserRole.MARKETING,
      pwdAdmin,
      null,
    );
    await createUser(
      'Awa',
      'Analyste',
      'analyste@beown.fr',
      UserRole.ANALYSTE_FINANCIER,
      pwdAdmin,
      null,
    );
    await createUser(
      'Paul',
      'Relation',
      'relation@beown.fr',
      UserRole.CHARGE_RELATION_INVESTISSEUR,
      pwdAdmin,
      null,
    );
    const porteur1 = await createUser(
      'Mamadou',
      'Sow',
      'porteur1@beown.fr',
      UserRole.PORTEUR,
      pwdPorteur,
      UserType.PM,
    );
    const porteur2 = await createUser(
      'Koffi',
      'Mensah',
      'porteur2@beown.fr',
      UserRole.PORTEUR,
      pwdPorteur,
      UserType.PM,
    );
    const inv1 = await createUser(
      'Fatou',
      'Ndiaye',
      'investisseur1@beown.fr',
      UserRole.INVESTISSEUR,
      pwdInvestisseur,
      UserType.PP,
    );
    const inv2 = await createUser(
      'Ibrahima',
      'Ba',
      'investisseur2@beown.fr',
      UserRole.INVESTISSEUR,
      pwdInvestisseur,
      UserType.PP,
    );
    const inv3 = await createUser(
      'Aïssatou',
      'Fall',
      'investisseur3@beown.fr',
      UserRole.INVESTISSEUR,
      pwdInvestisseur,
      UserType.PP,
    );
    const investors = [inv1, inv2, inv3];

    this.logger.log('✅ 10 utilisateurs créés (emails uniques)');

    // ════════════════════════════════════════════════════════════════════════
    // 2. PROFILS & KYC
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('📝 Profils & KYC...');

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

    // Investisseurs → personnes physiques + KYC validé (peuvent investir)
    const ppData = [
      {
        u: inv1,
        civilite: 'Mme',
        profession: 'Médecin',
        cat: CategorieInvestisseur.AVERTI,
      },
      {
        u: inv2,
        civilite: 'M.',
        profession: 'Ingénieur',
        cat: CategorieInvestisseur.NON_AVERTI,
      },
      {
        u: inv3,
        civilite: 'Mme',
        profession: 'Cadre bancaire',
        cat: CategorieInvestisseur.NON_AVERTI,
      },
    ];
    for (const { u, civilite, profession, cat } of ppData) {
      await this.profilPPRepo.save(
        this.profilPPRepo.create({
          utilisateurId: u.userId,
          civilite,
          prenom: u.firstname,
          nom: u.lastname,
          dateNaissance: new Date(1985, 4, 12),
          lieuNaissance: 'Dakar',
          paysNaissance: 'SN',
          nationalite: 'SN',
          adresseLigne1: '24 Rue de la Corniche, Dakar',
          codePostal: '11000',
          ville: 'Dakar',
          pays: 'SN',
          telephone: `+221 77 ${100 + u.userId} 00 0${u.userId}`,
          profession,
          secteurActivite: 'Finance',
          pep: false,
          residenceFiscale: 'SN',
          nif: `NIF-${1000000 + u.userId}`,
          categoriePsfp: cat,
        } as any),
      );
      await this.kycRepo.save(
        this.kycRepo.create({
          utilisateurId: u.userId,
          statut: KycStatus.VALIDE,
          niveau: KycNiveau.STANDARD,
          scoreRisque: 20,
          fournisseur: 'stripe',
          fournisseurRef: `kyc_${u.userId}`,
          valideJusquAu: new Date(Date.now() + 365 * 86_400_000),
        } as any),
      );
    }

    this.logger.log('✅ Profils PM (porteurs) + PP/KYC (investisseurs) créés');

    // ════════════════════════════════════════════════════════════════════════
    // 3. SPV (société de projet portant l'actif loué)
    // ════════════════════════════════════════════════════════════════════════
    const spv = (await this.spvRepo.save(
      this.spvRepo.create({
        raisonSociale: 'BeOwn Les Jardins SPV SAS',
        siren: '900112233',
        forme: 'SAS',
        capitalSocial: 10_000,
        siegeAdresse: 'Dakar, Sénégal',
        iban: 'SN08SN0100150000000000001',
      } as any) as any,
    )) as SpvEntity;

    // ════════════════════════════════════════════════════════════════════════
    // 4. PROJETS
    //    A) Résidence Les Jardins — porteur1 — déjà publié, financé, en exploitation
    //       modèle EQUITY (parts + loyers)
    //    B) Brouillon — porteur2 — soumis pour publication (illustre l'étape 1)
    //       modèle EQUITY
    //    C) Bureaux Plateau — porteur1 — en collecte, modèle OBLIGATAIRE
    //       (coupon fixe + échéancier)
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('🏗️ Création des projets...');

    const CAPITAL_CIBLE = 600_000; // 600 000 €
    const NB_FRACTIONS = 6_000;
    const PRIX_FRACTION = CAPITAL_CIBLE / NB_FRACTIONS; // 100 €

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
        youtubeUrl: null,
        capitalCible: CAPITAL_CIBLE,
        capitalMinimum: 360_000,
        ticketMinimum: PRIX_FRACTION,
        ticketMaximum: 300_000,
        nbFractions: NB_FRACTIONS,
        triCible: 9.0,
        dureeMois: 36,
        instrument: ProjectInstrument.PART_SOCIALE,
        // Equity locative : parts d'une société support, revenus = loyers réels
        // distribués mensuellement, sortie par cession. AUCUN échéancier de
        // coupons n'est généré pour ce projet (voir YouSignWebhookController).
        modeleEconomique: ModeleEconomique.EQUITY,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        descriptionMd: `## Résidence Les Jardins — Dakar Plateau

Immeuble résidentiel de 6 appartements loués, détenu via la SPV **BeOwn Les Jardins**. Les investisseurs détiennent des **parts sociales** et perçoivent une **distribution mensuelle** au prorata, issue des loyers nets encaissés.

- **Capital collecté :** 600 000 € (6 000 parts de 100 €) — **100 % financé**
- **Loyer mensuel cible :** 4 500 €
- **Rendement cible :** 9 % / an (distribution mensuelle)

> Investir comporte un risque de perte en capital. Placement illiquide.`,
        avertissementMd:
          'Investir comporte des risques de perte partielle ou totale du capital. Les performances passées ne préjugent pas des performances futures. Placement illiquide.',
        chronologie: [
          {
            etape: 'Publication du projet',
            date: this.daysAgo(90).toISOString().slice(0, 10),
            statut: 'done',
            description: 'Dossier validé et publié par BeOwn.',
          },
          {
            etape: 'Ouverture de la collecte',
            date: this.daysAgo(85).toISOString().slice(0, 10),
            statut: 'done',
          },
          {
            etape: 'Clôture — 100 % financé',
            date: this.daysAgo(60).toISOString().slice(0, 10),
            statut: 'done',
            description: '6 000 / 6 000 parts souscrites.',
          },
          {
            etape: 'Mise en exploitation',
            date: this.daysAgo(50).toISOString().slice(0, 10),
            statut: 'in_progress',
            description: 'Perception et distribution des loyers.',
          },
          {
            etape: 'Remboursement final',
            date: new Date(Date.now() + 36 * 30 * 86_400_000)
              .toISOString()
              .slice(0, 10),
            statut: 'pending',
          },
        ],
        garanties: [
          {
            type: 'Hypothèque 1er rang',
            description: 'Inscription sur le bien au profit de la SPV.',
            rang: 1,
          },
        ],
        previsionnel: {
          operation: {
            acquisition: 480_000,
            fraisNotaire: 35_000,
            travaux: 60_000,
            sequestre: 25_000,
          },
          financement: {
            apport: 60_000,
            financementBancaire: 0,
            montantInvestisseurs: CAPITAL_CIBLE,
          },
          resultat: { montantRevente: 840_000, coutOperation: 600_000 },
        },
        porteurId: porteur1.userId,
        spvId: spv.id,
        datePublication: this.daysAgo(90),
        dateOuvertureCollecte: this.daysAgo(85),
        dateCloturePrevue: this.daysAgo(58),
      } as any) as any,
    )) as ProjectEntity;

    // TEST Sedd of Beown

    // Projet B : brouillon soumis par le 2ᵉ porteur (en attente de publication admin)
    const projetB = (await this.projectRepo.save(
      this.projectRepo.create({
        slug: 'villas-cocody-abidjan',
        titre: 'Villas Cocody — Abidjan (en cours de validation)',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.BROUILLON,
        ville: 'Abidjan',
        region: 'Lagunes',
        pays: 'CI',
        adresseComplete: null,
        latitude: null,
        longitude: null,
        youtubeUrl: null,
        capitalCible: 400_000,
        capitalMinimum: 240_000,
        ticketMinimum: 100,
        ticketMaximum: 200_000,
        nbFractions: 4_000,
        triCible: 10.0,
        dureeMois: 24,
        instrument: ProjectInstrument.PART_SOCIALE,
        // Equity locative également : le brouillon en attente de publication
        // illustre le modèle cible de la plateforme.
        modeleEconomique: ModeleEconomique.EQUITY,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        descriptionMd:
          '## Villas Cocody — Abidjan\n\nDossier soumis par le porteur, en cours d’instruction par le comité BeOwn avant publication.',
        avertissementMd:
          'Investir comporte des risques de perte partielle ou totale du capital.',
        chronologie: null,
        garanties: null,
        previsionnel: null,
        porteurId: porteur2.userId,
        spvId: null,
        datePublication: null,
        dateOuvertureCollecte: null,
        dateCloturePrevue: null,
      } as any) as any,
    )) as ProjectEntity;

    // Projet C : émission OBLIGATAIRE (non résidentiel) — exemple de projet
    // qui n'est pas locatif : titre de créance à coupon fixe, en collecte.
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
        youtubeUrl: null,
        capitalCible: 500_000,
        capitalMinimum: 300_000,
        ticketMinimum: 500,
        ticketMaximum: 100_000,
        nbFractions: 1_000,
        triCible: 8.5,
        dureeMois: 24,
        instrument: ProjectInstrument.OBLIGATION,
        // Modèle obligataire explicite (et non par défaut implicite) : titre de
        // créance à coupon fixe, échéancier généré à la signature.
        modeleEconomique: ModeleEconomique.OBLIGATAIRE,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        descriptionMd: `## Bureaux Plateau — Abidjan (obligation)

Financement **obligataire** d'un plateau de bureaux loué à un locataire unique. Les investisseurs souscrivent des **obligations** et perçoivent un **coupon fixe** — il ne s'agit pas d'un placement locatif en parts, mais d'un titre de créance.

- **Montant de l'émission :** 500 000 € (1 000 obligations de 500 €)
- **Coupon :** 8,5 % / an, versé trimestriellement
- **Durée :** 24 mois, remboursement du capital in fine

> Investir comporte un risque de perte en capital. Placement illiquide, non garanti par l'État.`,
        avertissementMd:
          "Obligations : risque de défaut de l'émetteur et de perte totale du capital. Le coupon n'est pas garanti. Placement illiquide.",
        chronologie: [
          {
            etape: 'Publication du projet',
            date: this.daysAgo(10).toISOString().slice(0, 10),
            statut: 'done',
            description: 'Émission validée et publiée par BeOwn.',
          },
          {
            etape: 'Ouverture de la collecte',
            date: this.daysAgo(5).toISOString().slice(0, 10),
            statut: 'in_progress',
          },
          {
            etape: 'Clôture de la collecte',
            date: new Date(Date.now() + 30 * 86_400_000)
              .toISOString()
              .slice(0, 10),
            statut: 'pending',
          },
          {
            etape: 'Remboursement du capital (in fine)',
            date: new Date(Date.now() + 24 * 30 * 86_400_000)
              .toISOString()
              .slice(0, 10),
            statut: 'pending',
          },
        ],
        garanties: [
          {
            type: 'Nantissement des créances de loyers',
            description:
              'Loyers du locataire unique nantis au profit des porteurs obligataires.',
            rang: 1,
          },
        ],
        previsionnel: null,
        porteurId: porteur1.userId,
        spvId: null,
        datePublication: this.daysAgo(10),
        dateOuvertureCollecte: this.daysAgo(5),
        dateCloturePrevue: new Date(Date.now() + 30 * 86_400_000),
      } as any) as any,
    )) as ProjectEntity;

    await this.audit(porteur1, 'PROJECT_SUBMIT', 'PROJECT', projetA.id);
    await this.audit(admin, 'PROJECT_PUBLISH', 'PROJECT', projetA.id);
    await this.audit(porteur2, 'PROJECT_SUBMIT', 'PROJECT', projetB.id);
    await this.audit(porteur1, 'PROJECT_SUBMIT', 'PROJECT', projetC.id);
    await this.audit(admin, 'PROJECT_PUBLISH', 'PROJECT', projetC.id);
    this.logger.log(
      '✅ 3 projets créés (1 equity exploité, 1 brouillon, 1 obligation en collecte)',
    );

    // ════════════════════════════════════════════════════════════════════════
    // 5. WALLETS (1 par investisseur + wallet technique du projet + frais)
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('💰 Création des wallets...');

    const depots = [310_000, 185_000, 125_000]; // dépôts initiaux par investisseur (EUR)
    const investorWallets: WalletEntity[] = [];
    for (let i = 0; i < investors.length; i++) {
      const w = await this.walletRepo.save(
        this.walletRepo.create({
          type: WalletType.INVESTISSEUR,
          proprietaireUserId: investors[i].userId,
          fournisseurRef: `INV-${investors[i].userId}`,
          devise: 'EUR',
          solde: depots[i], // mis à jour au fil des opérations ci-dessous
        }),
      );
      investorWallets.push(w);
    }

    const projetWallet = await this.walletRepo.save(
      this.walletRepo.create({
        type: WalletType.TECHNIQUE_PROJET,
        projetId: projetA.id,
        fournisseurRef: `TECH-${projetA.id.slice(0, 8)}`,
        devise: 'EUR',
        solde: 0,
      }),
    );

    const fraisWallet = await this.walletRepo.save(
      this.walletRepo.create({
        type: WalletType.FRAIS_PLATEFORME,
        fournisseurRef: 'PLAT-FEES-001',
        devise: 'EUR',
        solde: 0,
      }),
    );

    // Dépôts initiaux (alimentation des wallets investisseurs)
    for (let i = 0; i < investorWallets.length; i++) {
      await this.transactionRepo.save(
        this.transactionRepo.create({
          walletSource: null,
          walletDestination: investorWallets[i].id,
          montant: depots[i],
          devise: 'EUR',
          type: TransactionType.DEPOT,
          // Dépôt en euros sur un marché SEPA : le seul prestataire branché
          // est Stripe. Le seed ne doit pas fabriquer d'historique mobile
          // money, qui n'a jamais eu d'adaptateur.
          fournisseur: TransactionFournisseur.STRIPE,
          fournisseurRef: `dep_${investors[i].userId}`,
          statut: TransactionStatus.REUSSI,
        }),
      );
      await this.audit(
        investors[i],
        'WALLET_DEPOSIT',
        'WALLET',
        investorWallets[i].id,
      );
    }
    this.logger.log('✅ Wallets + dépôts créés');

    // ════════════════════════════════════════════════════════════════════════
    // 6. INVESTISSEMENTS — collecte financée à 100 % (6 000/6 000 parts)
    //    inv1 = 3 000 parts (50 %), inv2 = 1 800 parts (30 %), inv3 = 1 200 parts (20 %)
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('📈 Souscriptions investisseurs (clôture à 100 %)...');

    const repartition = [
      { wallet: investorWallets[0], user: inv1, parts: 3_000 },
      { wallet: investorWallets[1], user: inv2, parts: 1_800 },
      { wallet: investorWallets[2], user: inv3, parts: 1_200 },
    ];

    let totalCollecte = 0;
    const savedInvestments: InvestmentEntity[] = [];
    for (const r of repartition) {
      const montant = r.parts * PRIX_FRACTION;
      totalCollecte += montant;

      const signatureId = crypto.randomUUID();
      const investment = await this.investmentRepo.save(
        this.investmentRepo.create({
          projetId: projetA.id,
          utilisateurId: r.user.userId,
          montant,
          instrument: projetA.instrument,
          nbTitres: r.parts,
          valeurTitre: PRIX_FRACTION,
          statut: InvestmentStatus.PAYE,
          delaiRetractationJusquAu: null,
          bulletinDocId: crypto.randomUUID(),
          signatureId,
        }),
      );
      savedInvestments.push(investment);

      // Bulletin de souscription signé électroniquement
      await this.signatureRepo.save(
        this.signatureRepo.create({
          id: signatureId,
          youSignRequestId: `ysr_${crypto.randomUUID().slice(0, 12)}`,
          youSignSignerId: `yss_${crypto.randomUUID().slice(0, 12)}`,
          youSignSigningUrl: null,
          documentId: investment.bulletinDocId ?? crypto.randomUUID(),
          investmentId: investment.id,
          ordreId: null,
          nbFractions: r.parts,
          userId: r.user.userId,
          statut: SignatureStatus.SIGNED,
          expiresAt: new Date(Date.now() + 14 * 86_400_000),
          signedAt: this.daysAgo(62),
        } as any),
      );

      // Virement de souscription : wallet investisseur → wallet technique projet
      await this.transactionRepo.save(
        this.transactionRepo.create({
          walletSource: r.wallet.id,
          walletDestination: projetWallet.id,
          montant,
          devise: 'EUR',
          type: TransactionType.SOUSCRIPTION,
          fournisseur: TransactionFournisseur.INTERNE,
          fournisseurRef: `souscr_${investment.id.slice(0, 8)}`,
          statut: TransactionStatus.REUSSI,
          investissementId: investment.id,
          projetId: projetA.id,
        }),
      );

      // Débit du wallet investisseur, crédit du wallet projet
      r.wallet.solde = Number(r.wallet.solde) - montant;
      await this.walletRepo.save(r.wallet);
      projetWallet.solde = Number(projetWallet.solde) + montant;
      await this.walletRepo.save(projetWallet);

      await this.audit(
        r.user,
        'INVESTMENT_CREATE',
        'INVESTMENT',
        investment.id,
      );
      await this.audit(r.user, 'INVESTMENT_SIGN', 'INVESTMENT', investment.id);
      await this.notify(r.user.userId, 'INVESTISSEMENT_CONFIRME', {
        projetId: projetA.id,
        montant,
        parts: r.parts,
      });
    }

    // Clôture à 100 % constatée par l'admin
    await this.audit(admin, 'PROJECT_FUNDED_100', 'PROJECT', projetA.id);
    await this.notify(porteur1.userId, 'PROJET_FINANCE', {
      projetId: projetA.id,
      totalCollecte,
    });
    this.logger.log(
      `✅ Collecte clôturée : ${totalCollecte.toLocaleString('fr-FR')} / ${CAPITAL_CIBLE.toLocaleString('fr-FR')} € (100 %)`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // 7. LOYER (côté porteur) — unité louée, bail, loyer encaissé
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log('🏠 Gestion locative & déclaration des loyers...');

    const LOYER_MENSUEL = 4_500; // 4 500 €/mois — immeuble de 600 000 € (9 % brut/an)

    const unite = await this.uniteRepo.save(
      this.uniteRepo.create({
        projetId: projetA.id,
        reference: 'RLJ-IMMEUBLE',
        surfaceM2: 420,
        loyerMensuelCible: LOYER_MENSUEL,
      }),
    );

    const locataire = await this.locataireRepo.save(
      this.locataireRepo.create({
        nomComplet: 'Cabinet Diop & Associés',
        email: 'contact@diop-associes.sn',
        telephone: '+221 33 821 00 00',
        spvId: spv.id,
      }),
    );

    const bail = await this.bailRepo.save(
      this.bailRepo.create({
        uniteLouableId: unite.id,
        locataireId: locataire.id,
        loyerMensuel: LOYER_MENSUEL,
        dateDebut: this.daysAgo(50),
        dateFin: null,
        statut: StatutBail.ACTIF,
        contratPdfUrl: null,
      }),
    );

    // Loyer du mois précédent : déclaré par le porteur PUIS validé par l'admin
    const periodeDistribuee = this.periode(-1);
    await this.loyerRepo.save(
      this.loyerRepo.create({
        bailId: bail.id,
        periode: periodeDistribuee,
        montant: LOYER_MENSUEL,
        dateEncaissement: this.daysAgo(8),
        preuves: ['recu-loyer-' + periodeDistribuee + '.pdf'],
        statut: StatutDeclaration.VALIDE,
        declareParUserId: porteur1.userId,
        valideParUserId: admin.userId,
        valideLe: this.daysAgo(6),
        motifRejet: null,
      }),
    );
    await this.audit(porteur1, 'LOYER_DECLARE', 'LOYER', bail.id);
    await this.audit(admin, 'LOYER_VALIDATE', 'LOYER', bail.id);

    // Loyer du mois courant : déclaré par le porteur, EN ATTENTE de validation admin
    const periodeEnAttente = this.periode(0);
    await this.loyerRepo.save(
      this.loyerRepo.create({
        bailId: bail.id,
        periode: periodeEnAttente,
        montant: LOYER_MENSUEL,
        dateEncaissement: this.daysAgo(2),
        preuves: ['recu-loyer-' + periodeEnAttente + '.pdf'],
        statut: StatutDeclaration.DECLARE,
        declareParUserId: porteur1.userId,
        valideParUserId: null,
        valideLe: null,
        motifRejet: null,
      }),
    );
    await this.audit(porteur1, 'LOYER_DECLARE', 'LOYER', bail.id);
    this.logger.log(
      `✅ Loyers : ${periodeDistribuee} (validé) + ${periodeEnAttente} (en attente admin)`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // 8. DISTRIBUTION / « PAIEMENT D'ÉCHÉANCE » — validation admin + virement auto
    //    Le loyer net validé est réparti au prorata vers chaque investisseur,
    //    puis crédité automatiquement sur son wallet.
    // ════════════════════════════════════════════════════════════════════════
    this.logger.log(
      '💸 Distribution du loyer (validation admin + virement)...',
    );

    const totalLoyers = LOYER_MENSUEL;
    const totalCharges = 0;
    const revenuNet = totalLoyers - totalCharges;

    const periodeDist = await this.periodeRepo.save(
      this.periodeRepo.create({
        projetId: projetA.id,
        periode: periodeDistribuee,
        totalLoyers,
        totalCharges,
        revenuNet,
        statut: StatutPeriodeDistribution.DISTRIBUEE,
        calculeeLe: this.daysAgo(5),
        valideeLe: this.daysAgo(5), // validée par l'admin
        distribueeLe: this.daysAgo(5),
      }),
    );
    await this.audit(
      admin,
      'DISTRIBUTION_VALIDATE',
      'DISTRIBUTION',
      periodeDist.id,
    );

    // Répartition au prorata des parts détenues + virement automatique
    let totalVerse = 0;
    for (let i = 0; i < savedInvestments.length; i++) {
      const inv = savedInvestments[i];
      const wallet = investorWallets[i];
      const pourcentage = (inv.nbTitres ?? 0) / NB_FRACTIONS; // 0.50 / 0.30 / 0.20
      const montantBrut = Math.round(revenuNet * pourcentage);
      const montantNet = montantBrut; // pas de prélèvement à la source dans ce seed (hors PFU)
      totalVerse += montantNet;

      await this.distributionPartRepo.save(
        this.distributionPartRepo.create({
          periodeDistributionId: periodeDist.id,
          investissementId: inv.id,
          pourcentageDetention: pourcentage,
          montantBrut,
          prelevementIR: 0,
          prelevementCSG: 0,
          montantNet,
          payeLe: this.daysAgo(5),
        }),
      );

      // Virement automatique : wallet projet → wallet investisseur
      await this.transactionRepo.save(
        this.transactionRepo.create({
          walletSource: projetWallet.id,
          walletDestination: wallet.id,
          montant: montantNet,
          devise: 'EUR',
          type: TransactionType.PAIEMENT_INTERETS,
          fournisseur: TransactionFournisseur.INTERNE,
          fournisseurRef: `distrib_${periodeDist.id.slice(0, 8)}_${inv.utilisateurId}`,
          statut: TransactionStatus.REUSSI,
          investissementId: inv.id,
          projetId: projetA.id,
          metadata: {
            periodeDistributionId: periodeDist.id,
            periode: periodeDistribuee,
          },
        }),
      );

      wallet.solde = Number(wallet.solde) + montantNet;
      await this.walletRepo.save(wallet);
      projetWallet.solde = Number(projetWallet.solde) - montantNet;
      await this.walletRepo.save(projetWallet);

      await this.notify(inv.utilisateurId, 'DISTRIBUTION_RECUE', {
        projetId: projetA.id,
        periode: periodeDistribuee,
        montantNet,
      });
    }
    await this.audit(
      admin,
      'DISTRIBUTION_EXECUTE',
      'DISTRIBUTION',
      periodeDist.id,
    );

    // Frais de plateforme prélevés sur la distribution (1 %)
    const frais = Math.round(revenuNet * 0.01);
    await this.transactionRepo.save(
      this.transactionRepo.create({
        walletSource: projetWallet.id,
        walletDestination: fraisWallet.id,
        montant: frais,
        devise: 'EUR',
        type: TransactionType.FRAIS,
        fournisseur: TransactionFournisseur.INTERNE,
        fournisseurRef: `frais_${periodeDist.id.slice(0, 8)}`,
        statut: TransactionStatus.REUSSI,
        projetId: projetA.id,
      }),
    );
    // Contrepartie obligatoire : toute écriture au grand livre a un débit ET un
    // crédit. Le débit du wallet technique du projet manquait — le solde du
    // wallet restait supérieur de `frais` au net des transactions, et l'état
    // financier du projet remontait un écart de réconciliation non nul.
    fraisWallet.solde = Number(fraisWallet.solde) + frais;
    await this.walletRepo.save(fraisWallet);
    projetWallet.solde = Number(projetWallet.solde) - frais;
    await this.walletRepo.save(projetWallet);

    this.logger.log(
      `✅ Distribution ${periodeDistribuee} : ${totalVerse.toLocaleString('fr-FR')} € versés (50/30/20 %) + ${frais.toLocaleString('fr-FR')} € de frais`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // RÉCAPITULATIF
    // ════════════════════════════════════════════════════════════════════════
    const line = '═'.repeat(64);
    this.logger.log(line);
    this.logger.log('✅ DATAFAKE BeOwn TERMINÉ');
    this.logger.log(line);
    this.logger.log('Comptes (mot de passe) :');
    this.logger.log(
      `  ADMIN        admin@beown.fr         → ${this.ADMIN_PASSWORD}`,
    );
    this.logger.log(
      `  CIO          cio@beown.fr           → ${this.ADMIN_PASSWORD}`,
    );
    this.logger.log(
      `  MARKETING    marketing@beown.fr     → ${this.ADMIN_PASSWORD}`,
    );
    this.logger.log(
      `  ANALYSTE     analyste@beown.fr      → ${this.ADMIN_PASSWORD}`,
    );
    this.logger.log(
      `  RELATION     relation@beown.fr      → ${this.ADMIN_PASSWORD}`,
    );
    this.logger.log(
      `  PORTEUR 1    porteur1@beown.fr      → ${this.PORTEUR_PASSWORD}`,
    );
    this.logger.log(
      `  PORTEUR 2    porteur2@beown.fr      → ${this.PORTEUR_PASSWORD}`,
    );
    this.logger.log(
      `  INVESTISSEUR investisseur1@beown.fr → ${this.INVESTISSEUR_PASSWORD}`,
    );
    this.logger.log(
      `  INVESTISSEUR investisseur2@beown.fr → ${this.INVESTISSEUR_PASSWORD}`,
    );
    this.logger.log(
      `  INVESTISSEUR investisseur3@beown.fr → ${this.INVESTISSEUR_PASSWORD}`,
    );
    this.logger.log(line);
    this.logger.log('Scénario joué sur « Résidence Les Jardins — Dakar » :');
    this.logger.log('  1. Publication (porteur1 → admin)  ✓');
    this.logger.log(
      '  2. Investissements (inv1/2/3)      ✓  3 000/1 800/1 200 parts',
    );
    this.logger.log('  3. Clôture 100 % (600 000 €)       ✓');
    this.logger.log(
      '  4. Loyer déclaré (porteur1)        ✓  validé admin + 1 en attente',
    );
    this.logger.log(
      '  5. Distribution + virement auto    ✓  2 250/1 350/900 €',
    );
    this.logger.log(line);
  }
}

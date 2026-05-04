import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  UserEntity,
  UserRole,
  UserStatus,
} from 'src/users/infrastructure/persistences/entities/user.entity';
import { UserEmailEntity } from 'src/users/infrastructure/persistences/entities/user-email.entity';
import { SpvEntity } from 'src/projects/infrastructure/persistences/entities/spv.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import {
  ProjectStatus,
  ProjectType,
  ProjectInstrument,
} from 'src/projects/domains/enums/project-status.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import {
  WalletType,
  TransactionType,
  TransactionStatus,
  TransactionFournisseur,
} from 'src/wallets/domains/enums/wallet.enum';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import {
  InvestmentStatus,
  EcheanceStatus,
} from 'src/investments/domains/enums/investment-status.enum';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { ReservationEntity } from 'src/reservations/infrastructure/persistences/entities/reservation.entity';
import { ReservationStatus } from 'src/reservations/domains/enums/reservation-status.enum';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { ProfilPMEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pm.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import {
  KycStatus,
  KycNiveau,
  CategoriePsfp,
} from 'src/profiles/domains/enums/kyc-status.enum';
import {
  NotificationEntity,
  NotificationCanal,
} from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { AuditLogEntity } from 'src/notifications/infrastructure/persistences/entities/audit-log.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import {
  DocumentType,
  DocumentRelatedTo,
} from 'src/documents/domains/enums/document-type.enum';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import {
  OrdreMarcheSens,
  OrdreMarcheStatus,
} from 'src/secondarymarket/domains/ordre-marche';
import { AvisEntity } from 'src/avis/infrastructure/persistences/entities/avis.entity';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserEmailEntity)
    private readonly emailRepo: Repository<UserEmailEntity>,
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
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
    @InjectRepository(ReservationEntity)
    private readonly reservationRepo: Repository<ReservationEntity>,
    @InjectRepository(ProfilPPEntity)
    private readonly profilPPRepo: Repository<ProfilPPEntity>,
    @InjectRepository(ProfilPMEntity)
    private readonly profilPMRepo: Repository<ProfilPMEntity>,
    @InjectRepository(KycEntity)
    private readonly kycRepo: Repository<KycEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepo: Repository<AuditLogEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreMarcheRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(AvisEntity)
    private readonly avisRepo: Repository<AvisEntity>,
  ) {}

  async seed(force: boolean = false): Promise<void> {
    this.logger.log('🚀 Début du seed complet...');

    // Vérifier si des données existent déjà (par exemple un admin)
    const existingCount = await this.userRepo.count({
      where: { role: UserRole.ADMIN },
    });
    if (existingCount > 0 && !force) {
      this.logger.log('⚠️ Seed déjà effectué — admin existant détecté.');
      this.logger.log('   Utilisez FORCE_SEED=true pour forcer la recréation.');
      return;
    }

    const hashedPassword = await bcrypt.hash('BeOwn@2025!', 12);
    const hashedPassword2 = await bcrypt.hash('Investisseur@2025!', 12);

    // ============================================================
    // 1. UTILISATEURS (30 utilisateurs variés)
    // ============================================================
    this.logger.log('👥 Création des utilisateurs...');

    const usersData = [
      // Staff BeOwn
      {
        firstname: 'Admin',
        lastname: 'BeOwn',
        email: 'admin@beown.com',
        role: UserRole.ADMIN,
      },
      {
        firstname: 'Marie',
        lastname: 'Compliance',
        email: 'compliance@beown.com',
        role: UserRole.COMPLIANCE,
      },
      {
        firstname: 'Jean',
        lastname: 'RCCI',
        email: 'rcci@beown.com',
        role: UserRole.RCCI,
      },
      {
        firstname: 'Pierre',
        lastname: 'Financier',
        email: 'financier@beown.com',
        role: UserRole.FINANCIER,
      },
      {
        firstname: 'Sophie',
        lastname: 'Support',
        email: 'support@beown.com',
        role: UserRole.SUPPORT,
      },
      {
        firstname: 'Lucas',
        lastname: 'DPO',
        email: 'dpo@beown.com',
        role: UserRole.DPO,
      },

      // Investisseurs Personnes Physiques (Sénégal)
      {
        firstname: 'Amadou',
        lastname: 'Diallo',
        email: 'amadou.diallo@email.sn',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Fatou',
        lastname: 'Sow',
        email: 'fatou.sow@email.sn',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Moussa',
        lastname: 'Ndiaye',
        email: 'moussa.ndiaye@email.sn',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Aïssatou',
        lastname: 'Ba',
        email: 'aissatou.ba@email.sn',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Ousmane',
        lastname: 'Fall',
        email: 'ousmane.fall@email.sn',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Mariama',
        lastname: 'Gueye',
        email: 'mariama.gueye@email.sn',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Ibrahima',
        lastname: 'Sy',
        email: 'ibrahima.sy@email.sn',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Aminata',
        lastname: 'Diop',
        email: 'aminata.diop@email.sn',
        role: UserRole.INVESTISSEUR,
      },

      // Investisseurs Personnes Physiques (Côte d\'Ivoire)
      {
        firstname: 'Kouamé',
        lastname: 'Kouassi',
        email: 'kouame.kouassi@email.ci',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Ahou',
        lastname: 'Bakayoko',
        email: 'ahou.bakayoko@email.ci',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Yao',
        lastname: "N'Guessan",
        email: 'yao.nguessan@email.ci',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Akissi',
        lastname: 'Koné',
        email: 'akissi.kone@email.ci',
        role: UserRole.INVESTISSEUR,
      },

      // Investisseurs Personnes Physiques (Mali)
      {
        firstname: 'Moussa',
        lastname: 'Traoré',
        email: 'moussa.traore@email.ml',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Fatoumata',
        lastname: 'Touré',
        email: 'fatoumata.toure@email.ml',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Bakary',
        lastname: 'Keïta',
        email: 'bakary.keita@email.ml',
        role: UserRole.INVESTISSEUR,
      },

      // Investisseurs Personnes Morales
      {
        firstname: 'Groupe',
        lastname: 'Diallo Invest',
        email: 'contact@diallo-invest.sn',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'SARL',
        lastname: 'Techno Plus',
        email: 'contact@technoplus.ci',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'SA',
        lastname: 'Global Finance',
        email: 'contact@globalfinance.ml',
        role: UserRole.INVESTISSEUR,
      },

      // Porteurs de Projets (Sénégal)
      {
        firstname: 'Abdoulaye',
        lastname: 'Seck',
        email: 'abdoulaye@immoseck.sn',
        role: UserRole.PORTEUR,
      },
      {
        firstname: 'Ndeye',
        lastname: 'Faye',
        email: 'ndeye@promofaye.sn',
        role: UserRole.PORTEUR,
      },
      {
        firstname: 'Serigne',
        lastname: 'Mbaye',
        email: 'serigne@construct.mb',
        role: UserRole.PORTEUR,
      },

      // Porteurs de Projets (Côte d\'Ivoire)
      {
        firstname: 'Koffi',
        lastname: 'Amani',
        email: 'koffi@amani.ci',
        role: UserRole.PORTEUR,
      },
      {
        firstname: 'Marie-Louise',
        lastname: 'Attoungbré',
        email: 'ml@attoungbre.ci',
        role: UserRole.PORTEUR,
      },

      // Porteurs de Projets (Mali)
      {
        firstname: 'Mamadou',
        lastname: 'Sidibé',
        email: 'mamadou@batimali.ml',
        role: UserRole.PORTEUR,
      },
    ];

    const savedUsers: UserEntity[] = [];
    const timestamp = Date.now();
    for (let i = 0; i < usersData.length; i++) {
      const u = usersData[i];
      const user = this.userRepo.create({
        firstname: u.firstname,
        lastname: u.lastname,
        password:
          u.role === UserRole.INVESTISSEUR || u.role === UserRole.PORTEUR
            ? hashedPassword2
            : hashedPassword,
        role: u.role,
        status: UserStatus.ACTIF,
        cguAccepteesLe: new Date(
          Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000,
        ),
        lastLoginAt:
          Math.random() > 0.3
            ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
            : null,
      });
      const saved = await this.userRepo.save(user);

      // Email unique avec timestamp pour éviter les doublons
      const uniqueEmail = u.email.replace('@', `+${timestamp}${i}@`);
      const emailEntity = this.emailRepo.create({
        email: uniqueEmail,
        isVerified: true,
        verifiedDate: new Date(
          Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000,
        ),
        user: saved,
      });
      await this.emailRepo.save(emailEntity);

      savedUsers.push(saved);
    }

    // Vérification qu'on a bien tous les utilisateurs
    if (savedUsers.length !== 30) {
      this.logger.error(
        `❌ Attendu 30 utilisateurs, créés: ${savedUsers.length}`,
      );
      throw new Error(
        `Nombre d'utilisateurs insuffisant: ${savedUsers.length}/30`,
      );
    }

    const staffUsers = savedUsers.slice(0, 6);
    const investisseursPP = savedUsers.slice(6, 21);
    const investisseursPM = savedUsers.slice(21, 24);
    const porteurs = savedUsers.slice(24);

    this.logger.log(`✅ ${savedUsers.length} utilisateurs créés`);
    this.logger.log(
      `   - Staff: ${staffUsers.length}, PP: ${investisseursPP.length}, PM: ${investisseursPM.length}, Porteurs: ${porteurs.length}`,
    );

    // Vérification des porteurs
    if (porteurs.length < 6) {
      this.logger.error(
        `❌ Pas assez de porteurs: ${porteurs.length}/6 attendus`,
      );
      throw new Error(`Nombre de porteurs insuffisant: ${porteurs.length}`);
    }

    // ============================================================
    // 2. PROFILS ET KYC
    // ============================================================
    this.logger.log('📝 Création des profils et KYC...');

    // Profils Personnes Physiques pour les investisseurs PP
    const civilites = ['M.', 'Mme'];
    const nationalites = ['SN', 'CI', 'ML', 'BF', 'TG', 'BJ'];
    const professions = [
      'Ingénieur',
      'Médecin',
      'Avocat',
      'Commerçant',
      'Enseignant',
      'Consultant',
      'Entrepreneur',
      'Cadre bancaire',
    ];

    for (const user of investisseursPP) {
      const birthDate = new Date(
        1970 + Math.floor(Math.random() * 35),
        Math.floor(Math.random() * 12),
        Math.floor(Math.random() * 28) + 1,
      );

      const profilPP = this.profilPPRepo.create({
        utilisateurId: user.userId,
        civilite: (Math.random() > 0.5 ? 'M.' : 'Mme') as any,
        prenom: user.firstname,
        nom: user.lastname,
        nomNaissance: (Math.random() > 0.8 ? user.lastname : undefined) as any,
        dateNaissance: birthDate,
        lieuNaissance: ['Dakar', 'Abidjan', 'Bamako', 'Thiès', 'Kaolack'][
          Math.floor(Math.random() * 5)
        ] as any,
        paysNaissance: nationalites[
          Math.floor(Math.random() * nationalites.length)
        ] as any,
        nationalite: nationalites[
          Math.floor(Math.random() * nationalites.length)
        ] as any,
        adresseLigne1:
          `${Math.floor(Math.random() * 999) + 1} Rue des Investisseurs` as any,
        adresseLigne2: (Math.random() > 0.5
          ? 'Appartement ' + (Math.floor(Math.random() * 50) + 1)
          : undefined) as any,
        codePostal: String(Math.floor(Math.random() * 90000) + 10000) as any,
        ville: ['Dakar', 'Abidjan', 'Bamako', 'Thiès', 'Ouagadougou'][
          Math.floor(Math.random() * 5)
        ] as any,
        pays: nationalites[Math.floor(Math.random() * 3)] as any,
        telephone:
          `+221${Math.floor(Math.random() * 90000000) + 70000000}` as any,
        profession: professions[
          Math.floor(Math.random() * professions.length)
        ] as any,
        secteurActivite: [
          'Immobilier',
          'Technologie',
          'Finance',
          'Santé',
          'Éducation',
          'Agriculture',
        ][Math.floor(Math.random() * 6)] as any,
        pep: Math.random() > 0.95,
        residenceFiscale: nationalites[Math.floor(Math.random() * 3)] as any,
        nif: (Math.random() > 0.3
          ? `NIF${Math.floor(Math.random() * 900000000) + 100000000}`
          : undefined) as any,
        categoriePsfp: [
          CategoriePsfp.NON_AVERTI,
          CategoriePsfp.AVERTI,
          CategoriePsfp.PROFESSIONNEL,
        ][Math.floor(Math.random() * 3)],
      } as any);
      await this.profilPPRepo.save(profilPP);

      // KYC
      const kycStatuses = [
        KycStatus.VALIDE,
        KycStatus.VALIDE,
        KycStatus.VALIDE,
        KycStatus.VALIDE,
        KycStatus.EN_COURS,
        KycStatus.VALIDE,
      ];
      const kycStatus =
        kycStatuses[Math.floor(Math.random() * kycStatuses.length)];

      const kyc = this.kycRepo.create({
        utilisateurId: user.userId,
        statut: kycStatus,
        niveau: [KycNiveau.STANDARD, KycNiveau.SIMPLE, KycNiveau.RENFORCE][
          Math.floor(Math.random() * 3)
        ],
        scoreRisque: Math.floor(Math.random() * 100),
        fournisseur: 'stripe',
        fournisseurRef: `kyc_${user.userId}_${Date.now()}`,
        valideJusquAu:
          kycStatus === KycStatus.VALIDE
            ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            : null,
      } as any);
      await this.kycRepo.save(kyc);
    }

    // Profils Personnes Morales
    const pmData = [
      {
        raisonSociale: 'Diallo Invest SARL',
        formeJuridique: 'SARL',
        siren: 'SN123456789',
        capitalSocial: 50000000,
      },
      {
        raisonSociale: 'Techno Plus CI',
        formeJuridique: 'SA',
        siren: 'CI987654321',
        capitalSocial: 100000000,
      },
      {
        raisonSociale: 'Global Finance Mali',
        formeJuridique: 'SAS',
        siren: 'ML456789123',
        capitalSocial: 75000000,
      },
    ];

    for (let i = 0; i < investisseursPM.length; i++) {
      const pm = pmData[i];
      const profilPM = this.profilPMRepo.create({
        utilisateurId: investisseursPM[i].userId,
        raisonSociale: pm.raisonSociale,
        formeJuridique: pm.formeJuridique as any,
        siren: pm.siren as any,
        rcsVille: ['Dakar', 'Abidjan', 'Bamako'][i] as any,
        capitalSocial: pm.capitalSocial,
        siegeAdresse:
          `${Math.floor(Math.random() * 999) + 1} Avenue de la Finance` as any,
        representantId: investisseursPP[0].userId,
        secteurActivite: ['Immobilier', 'Technologie', 'Finance'][i] as any,
      } as any);
      await this.profilPMRepo.save(profilPM);

      const kyc = this.kycRepo.create({
        utilisateurId: investisseursPM[i].userId,
        statut: KycStatus.VALIDE,
        niveau: KycNiveau.RENFORCE,
        scoreRisque: 15,
        fournisseur: 'stripe',
        fournisseurRef: `kyc_pm_${investisseursPM[i].userId}`,
        valideJusquAu: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      } as any);
      await this.kycRepo.save(kyc);
    }

    this.logger.log('✅ Profils et KYC créés');

    // ============================================================
    // 3. SPVs (8 SPVs)
    // ============================================================
    this.logger.log('🏢 Création des SPVs...');

    const spvData = [
      {
        raisonSociale: 'BeOwn Immo SPV 1 SAS',
        siren: '900123456',
        forme: 'SAS',
        capitalSocial: 10000,
        siegeAdresse: 'Dakar, Sénégal',
      },
      {
        raisonSociale: 'BeOwn Commercial SPV 2 SAS',
        siren: '900234567',
        forme: 'SAS',
        capitalSocial: 10000,
        siegeAdresse: "Abidjan, Côte d'Ivoire",
      },
      {
        raisonSociale: 'BeOwn Résidentiel SPV 3 SAS',
        siren: '900345678',
        forme: 'SAS',
        capitalSocial: 10000,
        siegeAdresse: 'Bamako, Mali',
      },
      {
        raisonSociale: 'BeOwn Viager SPV 4 SAS',
        siren: '900456789',
        forme: 'SAS',
        capitalSocial: 10000,
        siegeAdresse: 'Ouagadougou, Burkina',
      },
      {
        raisonSociale: 'BeOwn Tertiaire SPV 5 SAS',
        siren: '900567890',
        forme: 'SAS',
        capitalSocial: 10000,
        siegeAdresse: 'Dakar, Sénégal',
      },
      {
        raisonSociale: 'BeOwn MDB SPV 6 SAS',
        siren: '900678901',
        forme: 'SAS',
        capitalSocial: 10000,
        siegeAdresse: "Abidjan, Côte d'Ivoire",
      },
      {
        raisonSociale: 'BeOwn Token SPV 7 SAS',
        siren: '900789012',
        forme: 'SAS',
        capitalSocial: 10000,
        siegeAdresse: 'Lomé, Togo',
      },
      {
        raisonSociale: 'BeOwn Mixte SPV 8 SAS',
        siren: '900890123',
        forme: 'SAS',
        capitalSocial: 10000,
        siegeAdresse: 'Dakar, Sénégal',
      },
    ];

    const savedSpvs: SpvEntity[] = [];
    for (const spv of spvData) {
      const saved = await this.spvRepo.save(
        this.spvRepo.create({
          ...spv,
          iban: `SN08SN010015${String(savedSpvs.length + 1).padStart(9, '0')}`,
        }),
      );
      savedSpvs.push(saved);
    }

    this.logger.log(`✅ ${savedSpvs.length} SPVs créés`);

    // ============================================================
    // 4. PROJETS (15 projets avec différents statuts)
    // ============================================================
    this.logger.log('🏗️ Création des projets...');

    // ── Données enrichies pour chaque projet ──────────────────────────────────

    const chronologieType = (dureeMois: number) => [
      { etape: 'Publication du projet', date: new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10), statut: 'done', description: 'Dossier validé par le comité BeOwn.' },
      { etape: 'Ouverture de la collecte', date: new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10), statut: 'done', description: 'Mise en ligne sur la plateforme.' },
      { etape: 'Clôture de la collecte', date: new Date(Date.now() + 75 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Objectif 100 % atteint → projet financé.' },
      { etape: 'Acquisition du bien', date: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Signature acte authentique chez le notaire.' },
      { etape: 'Travaux & aménagement', date: new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Durée estimée : 3 à 6 mois.' },
      { etape: 'Mise en exploitation', date: new Date(Date.now() + (dureeMois - 2) * 30 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Perception des loyers ou revente.' },
      { etape: 'Remboursement investisseurs', date: new Date(Date.now() + dureeMois * 30 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Remboursement du capital + intérêts.' },
    ];

    const garantiesStandard = [
      { type: 'Hypothèque 1er rang', description: "Inscription hypothécaire de premier rang sur le bien financé, au profit des obligataires.", rang: 1 },
      { type: 'Caution solidaire du promoteur', description: "Le promoteur s'engage solidairement au remboursement du principal en cas de défaillance de la SPV.", rang: 2 },
      { type: "Garantie d'achèvement travaux", description: "Garantie bancaire couvrant la livraison du programme à hauteur du coût total des travaux.", rang: 3 },
    ];

    const projectsData = [
      // ── En collecte ────────────────────────────────────────────────────────
      {
        slug: 'residence-dakar-plateau',
        titre: 'Résidence Dakar Plateau',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.EN_COLLECTE,
        ville: 'Dakar',
        region: 'Dakar',
        pays: 'SN',
        adresseComplete: '12 Avenue Léopold Sédar Senghor, Plateau, Dakar',
        latitude: 14.6937,
        longitude: -17.4441,
        youtubeUrl: 'https://www.youtube.com/watch?v=ScMzIvxBSi4',
        capitalCible: 50000000,
        capitalMinimum: 30000000,
        ticketMinimum: 50000,
        ticketMaximum: 5000000,
        nbFractions: 1000,
        triCible: 12.5,
        dureeMois: 24,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: true,
        plafondPreInvestissement: 20000000,
        porteurIndex: 0,
        spvIndex: 0,
        hasDate: true,
        descriptionMd: `## Résidence Dakar Plateau — Investissez au cœur de la capitale

Situé au **Plateau**, le centre d'affaires historique de Dakar, ce projet résidentiel de haut standing vise à réhabiliter un immeuble R+5 en logements locatifs premium.

### Le projet
- **Surface totale :** 1 200 m² habitables
- **Nombre d'appartements :** 12 unités (T2 et T3)
- **Loyer mensuel cible :** 350 000 à 550 000 XOF / unité
- **Taux d'occupation estimé :** 92 %

### Pourquoi investir ?
Le Plateau reste la zone la plus recherchée par les expatriés et cadres supérieurs. La demande locative y est structurellement supérieure à l'offre, garantissant une rentabilité solide et durable.

### Structure juridique
L'opération est portée par la **SPV BeOwn Immo 1 SAS**, détentrice de l'immeuble. Les investisseurs souscrivent des **obligations** de 50 000 XOF offrant un coupon annuel de **12,5 %**.

### Risques
- Risque de vacance locative (mitigé par la localisation premium)
- Risque de taux (obligations à taux fixe)
- Risque de liquidité (investissement non coté)`,
        chronologie: chronologieType(24),
        garanties: garantiesStandard,
        previsionnel: {
          operation: { acquisition: 35000000, fraisNotaire: 1750000, travaux: 6000000, sequestre: 2000000, fraisHypotheque: 500000, fraisFinanciers: 1200000, autresCharges: 800000 },
          financement: { apport: 5000000, financementBancaire: 0, montantInvestisseurs: 50000000 },
          resultat: { montantRevente: 72000000, coutOperation: 47250000 },
        },
      },
      {
        slug: 'immeuble-commercial-abidjan',
        titre: 'Immeuble Commercial Abidjan Plateau',
        type: ProjectType.TERTIAIRE,
        statut: ProjectStatus.EN_COLLECTE,
        ville: 'Abidjan',
        region: 'Lagunes',
        pays: 'CI',
        adresseComplete: '45 Boulevard de la République, Plateau, Abidjan',
        latitude: 5.3365,
        longitude: -4.0267,
        youtubeUrl: 'https://www.youtube.com/watch?v=ScMzIvxBSi4',
        capitalCible: 80000000,
        capitalMinimum: 50000000,
        ticketMinimum: 100000,
        ticketMaximum: 10000000,
        nbFractions: 800,
        triCible: 9.0,
        dureeMois: 36,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: true,
        plafondPreInvestissement: 30000000,
        porteurIndex: 3,
        spvIndex: 1,
        hasDate: true,
        descriptionMd: `## Immeuble Commercial Abidjan Plateau — Le cœur économique d'Afrique de l'Ouest

Cet immeuble de bureaux R+6 est idéalement positionné sur le **Boulevard de la République**, artère principale du Plateau d'Abidjan, premier quartier d'affaires de la sous-région.

### Le projet
- **Surface louable :** 2 400 m² de bureaux divisibles
- **Locataires cibles :** cabinets d'avocats, banques, assurances, multinationales
- **Loyer de marché :** 15 000 à 22 000 XOF / m² / mois
- **Taux d'occupation cible :** 88 %

### Atouts
Le Plateau concentre plus de **70 % des sièges sociaux** implantés en Côte d'Ivoire. La raréfaction du foncier disponible rend l'offre de bureaux qualifiés structurellement insuffisante face à une demande en croissance de 8 % par an.

### Instrument financier
Obligations amortissables à **9 % / an** — remboursement mensuel du capital et des intérêts sur 36 mois.`,
        chronologie: chronologieType(36),
        garanties: garantiesStandard,
        previsionnel: {
          operation: { acquisition: 55000000, fraisNotaire: 2750000, travaux: 8000000, sequestre: 3000000, fraisHypotheque: 800000, fraisFinanciers: 2000000, autresCharges: 1200000 },
          financement: { apport: 8000000, financementBancaire: 0, montantInvestisseurs: 80000000 },
          resultat: { montantRevente: 115000000, coutOperation: 72750000 },
        },
      },
      {
        slug: 'villas-luxe-bamako',
        titre: 'Villas de Luxe ACI 2000 Bamako',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.EN_COLLECTE,
        ville: 'Bamako',
        region: 'District de Bamako',
        pays: 'ML',
        adresseComplete: 'Lot 234 Zone ACI 2000, Hamdallaye, Bamako',
        latitude: 12.6392,
        longitude: -8.0029,
        youtubeUrl: null,
        capitalCible: 35000000,
        capitalMinimum: 20000000,
        ticketMinimum: 25000,
        ticketMaximum: 2500000,
        nbFractions: 1400,
        triCible: 15.0,
        dureeMois: 18,
        instrument: ProjectInstrument.PART_SOCIALE,
        estPreInvestissable: true,
        plafondPreInvestissement: 15000000,
        porteurIndex: 5,
        spvIndex: 2,
        hasDate: true,
        descriptionMd: `## Villas de Luxe ACI 2000 — L'investissement haut de gamme à Bamako

La zone **ACI 2000** (Agence de Cession Immobilière) est le quartier résidentiel le plus prisé de Bamako, abritant ambassades, sièges d'ONG internationales et résidences des cadres expatriés.

### Le projet
- **3 villas individuelles** de 350 m² chacune avec piscine et jardin
- **Revente projetée** à l'issue des 18 mois de détention
- **Prix de revente estimé :** 15 à 18 M XOF / villa
- **Plus-value nette cible :** 28 % sur la mise

### Pourquoi ce rendement élevé ?
La rareté des biens de standing en état neuf génère une prime significative. Le promoteur bénéficie d'une relation privilégiée avec l'ACI pour l'acquisition du foncier à prix maîtrisé.

### Risques spécifiques
- Risque politique (contexte malien) — mitigé par la nature physique de l'actif
- Risque de délai de revente`,
        chronologie: [
          { etape: 'Acquisition du foncier ACI', date: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), statut: 'done', description: 'Acte de cession signé avec l\'ACI.' },
          { etape: 'Ouverture de la collecte', date: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10), statut: 'done', description: 'Lancement de la souscription investisseurs.' },
          { etape: 'Démarrage des travaux', date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Gros œuvre et fondations.' },
          { etape: 'Livraison des villas', date: new Date(Date.now() + 270 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Finitions et réception.' },
          { etape: 'Commercialisation et revente', date: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Agents immobiliers partenaires.' },
          { etape: 'Remboursement investisseurs', date: new Date(Date.now() + 540 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Capital + quote-part de plus-value.' },
        ],
        garanties: [
          { type: 'Hypothèque 1er rang', description: 'Inscription sur les 3 parcelles dès la signature.', rang: 1 },
          { type: 'Garantie bancaire de bonne fin', description: 'Garantie émise par Ecobank Mali couvrant 80 % du coût travaux.', rang: 2 },
        ],
        previsionnel: {
          operation: { acquisition: 12000000, fraisNotaire: 600000, travaux: 15000000, sequestre: 1500000, fraisHypotheque: 300000, fraisFinanciers: 800000, autresCharges: 500000 },
          financement: { apport: 3000000, financementBancaire: 0, montantInvestisseurs: 35000000 },
          resultat: { montantRevente: 52000000, coutOperation: 30700000 },
        },
      },
      {
        slug: 'bureaux-dakar-almadies',
        titre: 'Bureaux Premium Les Almadies',
        type: ProjectType.TERTIAIRE,
        statut: ProjectStatus.EN_COLLECTE,
        ville: 'Dakar',
        region: 'Dakar',
        pays: 'SN',
        adresseComplete: 'Route de la Corniche Ouest, Les Almadies, Dakar',
        latitude: 14.7290,
        longitude: -17.5210,
        youtubeUrl: 'https://www.youtube.com/watch?v=ScMzIvxBSi4',
        capitalCible: 45000000,
        capitalMinimum: 25000000,
        ticketMinimum: 75000,
        ticketMaximum: 5000000,
        nbFractions: 600,
        triCible: 10.5,
        dureeMois: 30,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        porteurIndex: 1,
        spvIndex: 4,
        hasDate: true,
        descriptionMd: `## Bureaux Premium Les Almadies — Vue mer, rendement durable

Les **Almadies** représentent la nouvelle centralité économique de Dakar : entreprises tech, cabinets de conseil et représentations diplomatiques s'y installent massivement depuis 2018.

### Le projet
- **Immeuble neuf R+4** de 1 800 m² sur la corniche
- **8 plateaux** de bureaux open-space modulables (200 m² chacun)
- **Terrasse panoramique** avec vue sur l'Atlantique
- **Parking souterrain** de 24 places

### Locataires pré-identifiés
Deux locataires ont signé des lettres d'intention couvrant 50 % de la surface dès la livraison : un cabinet d'audit international et une fintech panafricaine.

### Instrument
Obligations à taux fixe **10,5 % / an**, coupon versé trimestriellement, remboursement du principal en fin de terme.`,
        chronologie: chronologieType(30),
        garanties: garantiesStandard,
        previsionnel: {
          operation: { acquisition: 28000000, fraisNotaire: 1400000, travaux: 7000000, sequestre: 2000000, fraisHypotheque: 600000, fraisFinanciers: 1500000, autresCharges: 1000000 },
          financement: { apport: 6000000, financementBancaire: 0, montantInvestisseurs: 45000000 },
          resultat: { montantRevente: 68000000, coutOperation: 41500000 },
        },
      },

      // ── Pré-investissement / Annonce ──────────────────────────────────────
      {
        slug: 'residence-viager-ouaga',
        titre: 'Résidence Viager Ouagadougou',
        type: ProjectType.VIAGER,
        statut: ProjectStatus.PRE_INVESTISSEMENT,
        ville: 'Ouagadougou',
        region: 'Centre',
        pays: 'BF',
        adresseComplete: 'Secteur 4, Arrondissement de Baskuy, Ouagadougou',
        latitude: 12.3569,
        longitude: -1.5353,
        youtubeUrl: null,
        capitalCible: 25000000,
        capitalMinimum: 15000000,
        ticketMinimum: 50000,
        ticketMaximum: 2000000,
        nbFractions: 500,
        triCible: 11.0,
        dureeMois: 48,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: true,
        plafondPreInvestissement: 10000000,
        porteurIndex: 2,
        spvIndex: 3,
        hasDate: true,
        descriptionMd: `## Résidence Viager Ouagadougou — Un investissement solidaire et rentable

Ce projet inédit en Afrique de l'Ouest propose d'acquérir un bien immobilier via **vente en viager** auprès d'un senior propriétaire, offrant à ce dernier un complément de revenus tout en générant un rendement attractif pour les investisseurs.

### Fonctionnement
- **Bouquet initial :** 18 000 000 XOF financé par les investisseurs
- **Rente mensuelle** versée au vendeur : 120 000 XOF / mois
- **Espérance de revalorisation du bien :** +40 % sur 4 ans
- **Revente projetée à terme :** 38 000 000 XOF

### Profil du vendeur
Propriétaire unique, 72 ans, bien sans hypothèque, situé dans un quartier résidentiel calme et bien desservi.

> Ce projet est en phase de pré-investissement. Les réservations sont ouvertes.`,
        chronologie: [
          { etape: 'Audit juridique et évaluation', date: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10), statut: 'done', description: 'Évaluation contradictoire par deux experts.' },
          { etape: 'Ouverture des réservations', date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), statut: 'done', description: 'Pré-souscriptions acceptées.' },
          { etape: 'Ouverture de la collecte', date: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Démarrage officiel de la collecte.' },
          { etape: 'Signature acte viager', date: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Chez le notaire à Ouagadougou.' },
          { etape: 'Perception des loyers / rentes', date: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Flux trimestriels reversés aux investisseurs.' },
          { etape: 'Revente et clôture', date: new Date(Date.now() + 1440 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Horizon estimé : 48 mois.' },
        ],
        garanties: [
          { type: 'Acte notarié de viager', description: 'Transfert de propriété juridiquement sécurisé dès le bouquet.', rang: 1 },
          { type: 'Assurance décès invalidité', description: 'Police d\'assurance couvrant le risque de longévité du vendeur.', rang: 2 },
        ],
        previsionnel: {
          operation: { acquisition: 18000000, fraisNotaire: 900000, travaux: 500000, sequestre: 1000000, fraisHypotheque: 0, fraisFinanciers: 600000, autresCharges: 800000 },
          financement: { apport: 2000000, financementBancaire: 0, montantInvestisseurs: 25000000 },
          resultat: { montantRevente: 38000000, coutOperation: 21800000 },
        },
      },
      {
        slug: 'complexe-marchand-abidjan',
        titre: 'Complexe Marchand Cocody Abidjan',
        type: ProjectType.MARCHAND_DE_BIENS,
        statut: ProjectStatus.ANNONCE,
        ville: 'Abidjan',
        region: 'Lagunes',
        pays: 'CI',
        adresseComplete: 'Avenue Christiane Toure, Cocody Riviera, Abidjan',
        latitude: 5.3862,
        longitude: -3.9897,
        youtubeUrl: null,
        capitalCible: 60000000,
        capitalMinimum: 40000000,
        ticketMinimum: 100000,
        ticketMaximum: 8000000,
        nbFractions: 600,
        triCible: 18.0,
        dureeMois: 12,
        instrument: ProjectInstrument.ACTION,
        estPreInvestissable: true,
        plafondPreInvestissement: 25000000,
        porteurIndex: 4,
        spvIndex: 5,
        hasDate: false,
        descriptionMd: `## Complexe Marchand Cocody — Achat–rénovation–revente rapide

Opération de **marchand de biens** dans le quartier résidentiel haut de gamme de **Cocody Riviera** : acquisition d'un immeuble vieillissant de 8 appartements, rénovation complète, revente lot par lot à une clientèle aisée.

### Stratégie
1. **Acquisition** à 35 M XOF (décote de 30 % vs marché)
2. **Rénovation complète** sous 4 mois (cuisine équipée, climatisation, domotique)
3. **Revente individuelle** des 8 appartements à 12–14 M XOF pièce

### Rendement cible
TRI de **18 %** sur 12 mois, distribué en une seule fois à l'issue de la revente.

> Projet en cours d'instruction — ouverture de la collecte prévue dans 30 jours.`,
        chronologie: [
          { etape: 'Instruction du dossier BeOwn', date: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10), statut: 'in_progress', description: 'Due diligence juridique et technique en cours.' },
          { etape: 'Ouverture de la collecte', date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: 'Date prévisionnelle.' },
          { etape: 'Acquisition', date: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10), statut: 'pending' },
          { etape: 'Travaux de rénovation', date: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10), statut: 'pending', description: '4 mois de chantier.' },
          { etape: 'Commercialisation', date: new Date(Date.now() + 210 * 86400000).toISOString().slice(0, 10), statut: 'pending' },
          { etape: 'Remboursement investisseurs', date: new Date(Date.now() + 360 * 86400000).toISOString().slice(0, 10), statut: 'pending' },
        ],
        garanties: [
          { type: 'Hypothèque 1er rang', description: 'Inscrite dès l\'acquisition au profit de la SPV.', rang: 1 },
          { type: 'Garantie de rachat promoteur', description: 'Engagement de rachat à 95 % si la revente n\'est pas réalisée à 12 mois.', rang: 2 },
        ],
        previsionnel: {
          operation: { acquisition: 35000000, fraisNotaire: 1750000, travaux: 10000000, sequestre: 2000000, fraisHypotheque: 500000, fraisFinanciers: 1500000, autresCharges: 1200000 },
          financement: { apport: 5000000, financementBancaire: 0, montantInvestisseurs: 60000000 },
          resultat: { montantRevente: 96000000, coutOperation: 51950000 },
        },
      },

      // ── Financés à 100 % ───────────────────────────────────────────────────
      {
        slug: 'residence-tokenisee-lome',
        titre: 'Résidence Tokenisée Lomé — Clôturé',
        type: ProjectType.TOKENISE,
        statut: ProjectStatus.FINANCE,
        ville: 'Lomé',
        region: 'Maritime',
        pays: 'TG',
        adresseComplete: 'Boulevard du Mono, Quartier Tokoin, Lomé',
        latitude: 6.1375,
        longitude: 1.2123,
        youtubeUrl: null,
        capitalCible: 40000000,
        capitalMinimum: 25000000,
        ticketMinimum: 100000,
        ticketMaximum: 4000000,
        nbFractions: 400,
        triCible: 8.5,
        dureeMois: 60,
        instrument: ProjectInstrument.PART_SOCIALE,
        estPreInvestissable: true,
        plafondPreInvestissement: 20000000,
        porteurIndex: 0,
        spvIndex: 6,
        hasDate: false,
        descriptionMd: `## Résidence Tokenisée Lomé — 100 % Financé ✓

Ce projet a atteint son objectif de collecte. Les 400 fractions ont été intégralement souscrites par **127 investisseurs** en moins de 3 semaines.

### Suivi de l'opération
- Travaux démarrés en janvier 2025
- Avancement : **68 %** (structure et gros œuvre terminés)
- Livraison prévue : **Mars 2026**
- Première distribution d'intérêts : **Juin 2025**

### Performances à date
Les premiers coupons semestriels ont été versés dans les délais convenus.`,
        chronologie: [
          { etape: 'Publication', date: '2025-01-10', statut: 'done' },
          { etape: 'Collecte (400 fractions vendues)', date: '2025-01-28', statut: 'done', description: 'Financé en 18 jours.' },
          { etape: 'Acquisition et démarrage travaux', date: '2025-02-15', statut: 'done' },
          { etape: 'Livraison', date: '2026-03-01', statut: 'in_progress', description: 'Avancement 68 %.' },
          { etape: 'Exploitation et loyers', date: '2026-04-01', statut: 'pending' },
          { etape: 'Remboursement final', date: '2030-02-01', statut: 'pending' },
        ],
        garanties: garantiesStandard,
        previsionnel: {
          operation: { acquisition: 26000000, fraisNotaire: 1300000, travaux: 5000000, sequestre: 1500000, fraisHypotheque: 400000, fraisFinanciers: 900000 },
          financement: { apport: 5000000, financementBancaire: 0, montantInvestisseurs: 40000000 },
          resultat: { montantRevente: 58000000, coutOperation: 35100000 },
        },
      },
      {
        slug: 'immeuble-mixte-dakar',
        titre: 'Immeuble Mixte Dakar Médina — Clôturé',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.FINANCE,
        ville: 'Dakar',
        region: 'Dakar',
        pays: 'SN',
        adresseComplete: '8 Rue Tolbiac, Médina, Dakar',
        latitude: 14.7010,
        longitude: -17.4640,
        youtubeUrl: null,
        capitalCible: 55000000,
        capitalMinimum: 35000000,
        ticketMinimum: 50000,
        ticketMaximum: 6000000,
        nbFractions: 1100,
        triCible: 13.0,
        dureeMois: 20,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: true,
        plafondPreInvestissement: 20000000,
        porteurIndex: 1,
        spvIndex: 7,
        hasDate: false,
        descriptionMd: `## Immeuble Mixte Dakar Médina — 100 % Financé ✓

Collecte clôturée avec succès : **1 100 fractions vendues** à 213 investisseurs. L'immeuble R+4 mixte (commerces RDC + appartements) est en cours de construction.

### État d'avancement
- Fondations et dalle R+1 achevées
- Livraison prévue : **Août 2026**
- Les investisseurs perçoivent un coupon mensuel de **1,08 %**

### Performances
Aucun retard à date. Le chantier avance conformément au planning initial.`,
        chronologie: [
          { etape: 'Collecte finalisée', date: '2025-02-05', statut: 'done', description: '1 100 / 1 100 fractions vendues.' },
          { etape: 'Acquisition notariée', date: '2025-02-20', statut: 'done' },
          { etape: 'Démarrage chantier', date: '2025-03-01', statut: 'done' },
          { etape: 'Livraison', date: '2026-08-01', statut: 'in_progress', description: 'Avancement 35 %.' },
          { etape: 'Mise en location', date: '2026-09-01', statut: 'pending' },
          { etape: 'Remboursement final', date: '2026-11-01', statut: 'pending' },
        ],
        garanties: garantiesStandard,
        previsionnel: {
          operation: { acquisition: 36000000, fraisNotaire: 1800000, travaux: 8000000, sequestre: 2500000, fraisHypotheque: 700000, fraisFinanciers: 1500000, autresCharges: 1000000 },
          financement: { apport: 7000000, financementBancaire: 0, montantInvestisseurs: 55000000 },
          resultat: { montantRevente: 82000000, coutOperation: 51500000 },
        },
      },

      // ── En exploitation ───────────────────────────────────────────────────
      {
        slug: 'residence-active-thies',
        titre: 'Résidence Active Thiès',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.EN_EXPLOITATION,
        ville: 'Thiès',
        region: 'Thiès',
        pays: 'SN',
        adresseComplete: 'Cité Malick Sy, Avenue Léon Blum, Thiès',
        latitude: 14.7886,
        longitude: -16.9247,
        youtubeUrl: null,
        capitalCible: 30000000,
        capitalMinimum: 20000000,
        ticketMinimum: 25000,
        ticketMaximum: 3000000,
        nbFractions: 1200,
        triCible: 10.0,
        dureeMois: 36,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        porteurIndex: 2,
        spvIndex: 0,
        hasDate: false,
        descriptionMd: `## Résidence Active Thiès — En pleine exploitation

Ce projet de 16 appartements locatifs est entré en phase d'exploitation depuis **Mars 2024**. Les loyers sont collectés et redistribués trimestriellement aux investisseurs.

### Métriques d'exploitation (T1 2025)
- Taux d'occupation : **94 %** (15 / 16 appartements loués)
- Loyer mensuel moyen : 95 000 XOF / appartement
- Charges d'exploitation : 8 % des revenus locatifs

Les investisseurs perçoivent leur coupon trimestriel depuis 4 trimestres consécutifs, sans retard.`,
        chronologie: [
          { etape: 'Collecte et financement', date: '2023-09-15', statut: 'done' },
          { etape: 'Construction', date: '2023-10-01', statut: 'done', description: '5 mois de travaux.' },
          { etape: 'Livraison et première mise en location', date: '2024-03-01', statut: 'done' },
          { etape: 'Exploitation locative', date: '2024-03-15', statut: 'in_progress', description: 'Loyers trimestriels reversés depuis mars 2024.' },
          { etape: 'Remboursement final', date: '2026-09-01', statut: 'pending' },
        ],
        garanties: garantiesStandard,
        previsionnel: {
          operation: { acquisition: 18000000, fraisNotaire: 900000, travaux: 5000000, sequestre: 1200000, fraisHypotheque: 300000, fraisFinanciers: 800000 },
          financement: { apport: 4000000, financementBancaire: 0, montantInvestisseurs: 30000000 },
          resultat: { montantRevente: 42000000, coutOperation: 26200000 },
        },
      },
      {
        slug: 'bureaux-exploit-abidjan',
        titre: 'Bureaux en Exploitation — Zone 4 Abidjan',
        type: ProjectType.TERTIAIRE,
        statut: ProjectStatus.EN_EXPLOITATION,
        ville: 'Abidjan',
        region: 'Lagunes',
        pays: 'CI',
        adresseComplete: 'Rue des Jardins, Zone 4, Marcory, Abidjan',
        latitude: 5.3003,
        longitude: -3.9850,
        youtubeUrl: null,
        capitalCible: 70000000,
        capitalMinimum: 45000000,
        ticketMinimum: 100000,
        ticketMaximum: 8000000,
        nbFractions: 700,
        triCible: 8.0,
        dureeMois: 48,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        porteurIndex: 3,
        spvIndex: 1,
        hasDate: false,
        descriptionMd: `## Bureaux Zone 4 Abidjan — En exploitation depuis 2023

Immeuble de bureaux de 2 000 m² entièrement loué depuis la livraison en juin 2023. Locataires principaux : une banque régionale (700 m²) et deux cabinets de conseil (650 m² cumulés).

### Performance à date
- Taux d'occupation : **100 %**
- Baux signés de 3 ans ferme avec option de renouvellement
- Coupon semestriel versé à bonne date depuis 4 semestres

L'immeuble est entré en phase de stabilisation optimale.`,
        chronologie: [
          { etape: 'Collecte finalisée', date: '2023-01-20', statut: 'done' },
          { etape: 'Construction livrée', date: '2023-06-01', statut: 'done' },
          { etape: 'Baux signés', date: '2023-06-15', statut: 'done', description: 'Taux d\'occupation 100 %.' },
          { etape: 'Exploitation en cours', date: '2023-07-01', statut: 'in_progress', description: 'Coupons semestriels versés.' },
          { etape: 'Remboursement final', date: '2027-07-01', statut: 'pending' },
        ],
        garanties: garantiesStandard,
        previsionnel: {
          operation: { acquisition: 45000000, fraisNotaire: 2250000, travaux: 9000000, sequestre: 3000000, fraisHypotheque: 800000, fraisFinanciers: 2000000, autresCharges: 1500000 },
          financement: { apport: 10000000, financementBancaire: 0, montantInvestisseurs: 70000000 },
          resultat: { montantRevente: 105000000, coutOperation: 63550000 },
        },
      },

      // ── Clôturés ──────────────────────────────────────────────────────────
      {
        slug: 'residence-cloturee-dakar',
        titre: 'Résidence Clôturée Dakar (2022)',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.CLOTURE,
        ville: 'Dakar',
        region: 'Dakar',
        pays: 'SN',
        adresseComplete: '22 Rue Victor Hugo, Fann Résidence, Dakar',
        latitude: 14.6894,
        longitude: -17.4588,
        youtubeUrl: null,
        capitalCible: 40000000,
        capitalMinimum: 25000000,
        ticketMinimum: 50000,
        ticketMaximum: 4000000,
        nbFractions: 800,
        triCible: 12.0,
        dureeMois: 18,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        porteurIndex: 0,
        spvIndex: 2,
        hasDate: false,
        descriptionMd: `## Résidence Fann Résidence — Projet clôturé avec succès

**Remboursement total effectué** en décembre 2023. Les 800 investisseurs ont récupéré leur capital et les intérêts cumulés sur 18 mois, soit un TRI réalisé de **12,3 %** (légèrement supérieur à la cible de 12 %).`,
        chronologie: [
          { etape: 'Collecte', date: '2022-06-01', statut: 'done' },
          { etape: 'Construction et livraison', date: '2022-12-01', statut: 'done' },
          { etape: 'Exploitation et loyers', date: '2023-01-01', statut: 'done' },
          { etape: 'Revente de l\'immeuble', date: '2023-11-15', statut: 'done', description: 'Prix de revente : 58 M XOF.' },
          { etape: 'Remboursement investisseurs', date: '2023-12-01', statut: 'done', description: 'TRI réalisé : 12,3 %.' },
        ],
        garanties: garantiesStandard,
        previsionnel: {
          operation: { acquisition: 25000000, fraisNotaire: 1250000, travaux: 5500000, sequestre: 1500000, fraisHypotheque: 400000, fraisFinanciers: 1000000 },
          financement: { apport: 5000000, financementBancaire: 0, montantInvestisseurs: 40000000 },
          resultat: { montantRevente: 58000000, coutOperation: 34650000 },
        },
      },
      {
        slug: 'projet-rembourse-total',
        titre: 'Opération MDB Abidjan — Remboursé',
        type: ProjectType.MARCHAND_DE_BIENS,
        statut: ProjectStatus.CLOTURE,
        ville: 'Abidjan',
        region: 'Lagunes',
        pays: 'CI',
        adresseComplete: 'Rue des Bâtisseurs, Yopougon, Abidjan',
        latitude: 5.3438,
        longitude: -4.0740,
        youtubeUrl: null,
        capitalCible: 25000000,
        capitalMinimum: 15000000,
        ticketMinimum: 25000,
        ticketMaximum: 2500000,
        nbFractions: 1000,
        triCible: 20.0,
        dureeMois: 6,
        instrument: ProjectInstrument.ACTION,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        porteurIndex: 4,
        spvIndex: 5,
        hasDate: false,
        descriptionMd: `## Opération MDB Yopougon — Clôturé et remboursé à 100 %

Cette opération courte de 6 mois (achat–rénovation légère–revente) a dégagé un TRI réalisé de **21,4 %**, dépassant la cible initiale de 20 %.

Les 1 000 investisseurs ont été intégralement remboursés en **novembre 2024**.`,
        chronologie: [
          { etape: 'Acquisition', date: '2024-05-10', statut: 'done' },
          { etape: 'Rénovation', date: '2024-06-01', statut: 'done', description: '6 semaines de travaux.' },
          { etape: 'Revente', date: '2024-10-15', statut: 'done', description: '38,5 M XOF.' },
          { etape: 'Remboursement', date: '2024-11-01', statut: 'done', description: 'TRI réalisé : 21,4 %.' },
        ],
        garanties: [],
        previsionnel: {
          operation: { acquisition: 16000000, fraisNotaire: 800000, travaux: 2500000, sequestre: 800000, fraisHypotheque: 0, fraisFinanciers: 500000, autresCharges: 400000 },
          financement: { apport: 3000000, financementBancaire: 0, montantInvestisseurs: 25000000 },
          resultat: { montantRevente: 38500000, coutOperation: 21000000 },
        },
      },

      // ── Brouillons ────────────────────────────────────────────────────────
      {
        slug: 'brouillon-projet-1',
        titre: 'Projet en Brouillon — Kaolack',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.BROUILLON,
        ville: 'Kaolack',
        region: 'Kaolack',
        pays: 'SN',
        adresseComplete: null,
        latitude: null,
        longitude: null,
        youtubeUrl: null,
        capitalCible: 35000000,
        capitalMinimum: 20000000,
        ticketMinimum: 25000,
        ticketMaximum: 2500000,
        nbFractions: 1400,
        triCible: 11.5,
        dureeMois: 24,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        porteurIndex: 1,
        spvIndex: null,
        hasDate: false,
        descriptionMd: `## Brouillon — En cours de structuration\n\nDossier en cours de validation par le comité BeOwn.`,
        chronologie: null,
        garanties: null,
        previsionnel: null,
      },
      {
        slug: 'brouillon-projet-2',
        titre: 'Projet en Brouillon — Grand Bassam',
        type: ProjectType.TERTIAIRE,
        statut: ProjectStatus.BROUILLON,
        ville: 'Grand Bassam',
        region: 'Sud-Comoé',
        pays: 'CI',
        adresseComplete: null,
        latitude: null,
        longitude: null,
        youtubeUrl: null,
        capitalCible: 90000000,
        capitalMinimum: 60000000,
        ticketMinimum: 150000,
        ticketMaximum: 15000000,
        nbFractions: 600,
        triCible: 9.5,
        dureeMois: 42,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: true,
        plafondPreInvestissement: 40000000,
        porteurIndex: 3,
        spvIndex: null,
        hasDate: false,
        descriptionMd: `## Brouillon — En cours de structuration\n\nDossier en cours de validation par le comité BeOwn.`,
        chronologie: null,
        garanties: null,
        previsionnel: null,
      },
    ];

    const savedProjects: ProjectEntity[] = [];
    const projTimestamp = Date.now().toString().slice(-6); // Derniers 6 chiffres
    for (let i = 0; i < projectsData.length; i++) {
      const p = projectsData[i];
      const uniqueSlug = `${p.slug}-${projTimestamp}-${i}`;
      const project = this.projectRepo.create({
        slug: uniqueSlug,
        titre: p.titre,
        type: p.type,
        statut: p.statut,
        ville: p.ville,
        region: p.region,
        pays: p.pays,
        adresseComplete: p.adresseComplete ?? null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        youtubeUrl: p.youtubeUrl ?? null,
        capitalCible: p.capitalCible,
        capitalMinimum: p.capitalMinimum,
        ticketMinimum: p.ticketMinimum,
        ticketMaximum: p.ticketMaximum,
        nbFractions: p.nbFractions,
        triCible: p.triCible,
        dureeMois: p.dureeMois,
        instrument: p.instrument,
        estPreInvestissable: p.estPreInvestissable,
        plafondPreInvestissement: p.plafondPreInvestissement,
        descriptionMd: p.descriptionMd,
        avertissementMd: `⚠️ Investir comporte des risques de perte partielle ou totale du capital investi. Les performances passées ne préjugent pas des performances futures. Cet investissement est illiquide et non garanti par l'État.`,
        chronologie: p.chronologie ?? null,
        garanties: p.garanties ?? null,
        previsionnel: p.previsionnel ?? null,
        porteurId: porteurs[p.porteurIndex].userId,
        spvId: p.spvIndex !== null ? savedSpvs[p.spvIndex].id : null,
        datePublication: p.hasDate
          ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          : null,
        dateOuvertureCollecte: p.hasDate
          ? new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
          : null,
        dateCloturePrevue: p.hasDate
          ? new Date(Date.now() + 75 * 24 * 60 * 60 * 1000)
          : null,
      } as any);
      const saved = await this.projectRepo.save(project as any) as ProjectEntity;
      savedProjects.push(saved);
    }

    this.logger.log(`✅ ${savedProjects.length} projets créés`);

    // ============================================================
    // 5. WALLETS (Multiples wallets par utilisateur et projet)
    // ============================================================
    this.logger.log('💰 Création des wallets...');

    // Wallets plateforme
    const platformWallets = [
      {
        type: WalletType.FRAIS_PLATEFORME,
        ref: 'PLAT-FEES-001',
        solde: 1500000,
      },
      {
        type: WalletType.FRAIS_PLATEFORME,
        ref: 'PLAT-FEES-002',
        solde: 2500000,
      },
      { type: WalletType.TAXES, ref: 'PLAT-TAX-001', solde: 500000 },
    ];
    for (const w of platformWallets) {
      await this.walletRepo.save(
        this.walletRepo.create({
          type: w.type,
          fournisseurRef: w.ref,
          devise: 'XOF',
          solde: w.solde,
        }),
      );
    }

    // Wallets investisseurs (plusieurs par investisseur)
    const walletDevises = ['XOF', 'XOF', 'XOF', 'EUR', 'USD'];
    for (const user of [...investisseursPP, ...investisseursPM]) {
      const numWallets = Math.floor(Math.random() * 2) + 1;
      for (let i = 0; i < numWallets; i++) {
        const devise =
          walletDevises[Math.floor(Math.random() * walletDevises.length)];
        const solde =
          devise === 'XOF'
            ? Math.floor(Math.random() * 10000000) + 100000
            : Math.floor(Math.random() * 15000) + 150;

        await this.walletRepo.save(
          this.walletRepo.create({
            type: WalletType.INVESTISSEUR,
            proprietaireUserId: user.userId,
            fournisseurRef: `INV-${user.userId}-${String(i + 1).padStart(3, '0')}`,
            devise,
            solde,
          }),
        );
      }
    }

    // Wallets techniques et SPV par projet
    const activeProjects = savedProjects.filter((p) =>
      [
        ProjectStatus.EN_COLLECTE,
        ProjectStatus.ANNONCE,
        ProjectStatus.PRE_INVESTISSEMENT,
        ProjectStatus.FINANCE,
        ProjectStatus.EN_EXPLOITATION,
      ].includes(p.statut),
    );

    for (const project of activeProjects) {
      // Wallet technique projet
      await this.walletRepo.save(
        this.walletRepo.create({
          type: WalletType.TECHNIQUE_PROJET,
          projetId: project.id,
          fournisseurRef: `TECH-${project.id.slice(0, 8)}`,
          devise: 'XOF',
          solde: Math.floor(Math.random() * 5000000),
        }),
      );

      // Wallet SPV si applicable
      if (project.spvId) {
        await this.walletRepo.save(
          this.walletRepo.create({
            type: WalletType.SPV,
            projetId: project.id,
            spvId: project.spvId,
            fournisseurRef: `SPV-${project.id.slice(0, 8)}`,
            devise: 'XOF',
            solde: Math.floor(Math.random() * 10000000),
          }),
        );
      }
    }

    this.logger.log('✅ Wallets créés');

    // ============================================================
    // 6. INVESTISSEMENTS (40+ investissements variés)
    // ============================================================
    this.logger.log('📈 Création des investissements...');

    const investableProjects = savedProjects.filter((p) =>
      [
        ProjectStatus.EN_COLLECTE,
        ProjectStatus.FINANCE,
        ProjectStatus.EN_EXPLOITATION,
        ProjectStatus.CLOTURE,
      ].includes(p.statut),
    );

    const savedInvestments: InvestmentEntity[] = [];

    // Créer plusieurs investissements par projet
    for (const project of investableProjects) {
      const numInvestissements = Math.floor(Math.random() * 6) + 3; // 3-8 investissements par projet

      for (let i = 0; i < numInvestissements; i++) {
        const investor = [...investisseursPP, ...investisseursPM][
          Math.floor(
            Math.random() * (investisseursPP.length + investisseursPM.length),
          )
        ];
        // Modèle fractions : montant = nbFractions × prixFraction
        const prixFraction = Number(project.ticketMinimum);
        const maxFractionsParInvest = project.ticketMaximum
          ? Math.floor(Number(project.ticketMaximum) / prixFraction)
          : 20;
        const nbTitres = Math.floor(Math.random() * Math.min(maxFractionsParInvest, 10)) + 1;
        const montant = nbTitres * prixFraction;

        // Statut pondéré selon le statut du projet
        let statut: InvestmentStatus;
        if (project.statut === ProjectStatus.CLOTURE) {
          statut = Math.random() > 0.2
            ? InvestmentStatus.REMBOURSE_TOTAL
            : InvestmentStatus.REMBOURSE_CAPITAL;
        } else if (project.statut === ProjectStatus.EN_EXPLOITATION) {
          statut = InvestmentStatus.PAYE;
        } else if (project.statut === ProjectStatus.FINANCE) {
          statut = [
            InvestmentStatus.CONFIRME,
            InvestmentStatus.CONFIRME,
            InvestmentStatus.SIGNE,
            InvestmentStatus.PAYE,
          ][Math.floor(Math.random() * 4)];
        } else {
          // EN_COLLECTE : majorité confirmés pour que le taux de remplissage soit visible
          statut = [
            InvestmentStatus.CONFIRME,
            InvestmentStatus.CONFIRME,
            InvestmentStatus.CONFIRME,
            InvestmentStatus.SIGNE,
            InvestmentStatus.PAYE,
            InvestmentStatus.INITIE,
            InvestmentStatus.ANNULE,
          ][Math.floor(Math.random() * 7)];
        }

        const investment = this.investmentRepo.create({
          projetId: project.id,
          utilisateurId: investor.userId,
          montant,
          instrument: project.instrument,
          nbTitres,
          valeurTitre: prixFraction,
          statut,
          delaiRetractationJusquAu:
            statut === InvestmentStatus.INITIE
              ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
              : null,
          bulletinDocId: Math.random() > 0.3 ? crypto.randomUUID() : null,
          signatureId: Math.random() > 0.5 ? crypto.randomUUID() : null,
        });
        const saved = await this.investmentRepo.save(investment);
        savedInvestments.push(saved);
      }
    }

    this.logger.log(`✅ ${savedInvestments.length} investissements créés`);

    // ============================================================
    // 7. ÉCHÉANCES (pour investissements confirmés)
    // ============================================================
    this.logger.log('📅 Création des échéances...');

    const confirmedInvestments = savedInvestments.filter((i) =>
      [
        InvestmentStatus.CONFIRME,
        InvestmentStatus.REMBOURSE_CAPITAL,
        InvestmentStatus.REMBOURSE_TOTAL,
      ].includes(i.statut),
    );

    let echeanceCount = 0;
    for (const investment of confirmedInvestments) {
      const project = savedProjects.find((p) => p.id === investment.projetId);
      if (!project) continue;

      const numEcheances = Math.floor(project.dureeMois / 6); // Échéances semestrielles
      const montantTotal = Number(investment.montant);
      const montantEcheance = montantTotal / numEcheances;

      for (let i = 0; i < numEcheances; i++) {
        const datePrevue = new Date(
          Date.now() + (i + 1) * 6 * 30 * 24 * 60 * 60 * 1000,
        );
        const isPast = datePrevue < new Date();

        let statut: EcheanceStatus;
        if (investment.statut === InvestmentStatus.REMBOURSE_TOTAL) {
          statut = EcheanceStatus.PAYE;
        } else if (
          investment.statut === InvestmentStatus.REMBOURSE_CAPITAL &&
          i < numEcheances / 2
        ) {
          statut = EcheanceStatus.PAYE;
        } else if (isPast) {
          statut =
            Math.random() > 0.9 ? EcheanceStatus.RETARD : EcheanceStatus.PAYE;
        } else {
          statut = EcheanceStatus.A_VENIR;
        }

        await this.echeanceRepo.save(
          this.echeanceRepo.create({
            investissementId: investment.id,
            numero: i + 1,
            datePrevue,
            montantCapital: montantEcheance * 0.8,
            montantInterets: montantEcheance * 0.2,
            montantTotal: montantEcheance,
            statut,
            payeLe:
              statut === EcheanceStatus.PAYE
                ? new Date(
                    datePrevue.getTime() +
                      Math.random() * 5 * 24 * 60 * 60 * 1000,
                  )
                : null,
          }),
        );
        echeanceCount++;
      }
    }

    this.logger.log(`✅ ${echeanceCount} échéances créées`);

    // ============================================================
    // 8. RÉSERVATIONS (20+ réservations)
    // ============================================================
    this.logger.log('🎫 Création des réservations...');

    const preInvestProjects = savedProjects.filter((p) =>
      [ProjectStatus.ANNONCE, ProjectStatus.PRE_INVESTISSEMENT].includes(
        p.statut,
      ),
    );

    const reservationStatuses = Object.values(ReservationStatus);
    let reservationCount = 0;

    for (const project of preInvestProjects) {
      const numReservations = Math.floor(Math.random() * 8) + 5;

      for (let i = 0; i < numReservations; i++) {
        const investor =
          investisseursPP[Math.floor(Math.random() * investisseursPP.length)];
        const statut =
          reservationStatuses[
            Math.floor(Math.random() * reservationStatuses.length)
          ];

        await this.reservationRepo.save(
          this.reservationRepo.create({
            projetId: project.id,
            utilisateurId: investor.userId,
            montantReserve:
              Math.floor(Math.random() * 500000) + project.ticketMinimum,
            rangFile: statut === ReservationStatus.EN_ATTENTE ? i + 1 : null,
            statut,
            confirmationJusquAu:
              statut === ReservationStatus.VALIDEE
                ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                : null,
          }),
        );
        reservationCount++;
      }
    }

    this.logger.log(`✅ ${reservationCount} réservations créées`);

    // ============================================================
    // 9. TRANSACTIONS (100+ transactions variées)
    // ============================================================
    this.logger.log('💳 Création des transactions...');

    const transactionTypes = Object.values(TransactionType);
    const transactionStatuses = Object.values(TransactionStatus);
    const fournisseurs = Object.values(TransactionFournisseur);

    const allWallets = await this.walletRepo.find();
    const investorWallets = allWallets.filter(
      (w) => w.type === WalletType.INVESTISSEUR,
    );
    const platformWalletsList = allWallets.filter(
      (w) =>
        w.type === WalletType.FRAIS_PLATEFORME || w.type === WalletType.TAXES,
    );
    const projectWallets = allWallets.filter(
      (w) => w.type === WalletType.TECHNIQUE_PROJET,
    );

    const transactionsData: Array<{
      type: TransactionType;
      walletSource: string | null;
      walletDestination: string | null;
      montant: number;
      statut: TransactionStatus;
    }> = [];

    // Dépôts
    for (const wallet of investorWallets) {
      const numDepots = Math.floor(Math.random() * 5) + 1;
      for (let i = 0; i < numDepots; i++) {
        transactionsData.push({
          type: TransactionType.DEPOT,
          walletSource: null,
          walletDestination: wallet.id,
          montant: Math.floor(Math.random() * 2000000) + 50000,
          statut:
            Math.random() > 0.1
              ? TransactionStatus.REUSSI
              : TransactionStatus.ECHOUE,
        });
      }
    }

    // Souscriptions (liées aux investissements)
    for (const investment of savedInvestments) {
      const investorWallet = investorWallets.find(
        (w) => w.proprietaireUserId === investment.utilisateurId,
      );
      const projectWallet = projectWallets.find(
        (w) => w.projetId === investment.projetId,
      );

      if (investorWallet && projectWallet) {
        transactionsData.push({
          type: TransactionType.SOUSCRIPTION,
          walletSource: investorWallet.id,
          walletDestination: projectWallet.id,
          montant: Number(investment.montant),
          statut:
            investment.statut === InvestmentStatus.ANNULE
              ? TransactionStatus.ANNULE
              : TransactionStatus.REUSSI,
        });
      }
    }

    // Remboursements (pour échéances payées)
    const paidEcheances = await this.echeanceRepo.find({
      where: { statut: EcheanceStatus.PAYE },
    });
    for (const echeance of paidEcheances) {
      const investment = savedInvestments.find(
        (i) => i.id === echeance.investissementId,
      );
      if (!investment) continue;

      const investorWallet = investorWallets.find(
        (w) => w.proprietaireUserId === investment.utilisateurId,
      );
      const projectWallet = projectWallets.find(
        (w) => w.projetId === investment.projetId,
      );

      if (investorWallet && projectWallet) {
        transactionsData.push({
          type: TransactionType.REMBOURSEMENT_CAPITAL,
          walletSource: projectWallet.id,
          walletDestination: investorWallet.id,
          montant: Number(echeance.montantCapital),
          statut: TransactionStatus.REUSSI,
        });
        transactionsData.push({
          type: TransactionType.PAIEMENT_INTERETS,
          walletSource: projectWallet.id,
          walletDestination: investorWallet.id,
          montant: Number(echeance.montantInterets),
          statut: TransactionStatus.REUSSI,
        });
      }
    }

    // Frais et impôts
    for (let i = 0; i < 20; i++) {
      const projectWallet =
        projectWallets[Math.floor(Math.random() * projectWallets.length)];
      const platformWallet =
        platformWalletsList[
          Math.floor(Math.random() * platformWalletsList.length)
        ];
      if (projectWallet && platformWallet) {
        transactionsData.push({
          type:
            Math.random() > 0.5
              ? TransactionType.FRAIS
              : TransactionType.IMPOTS,
          walletSource: projectWallet.id,
          walletDestination: platformWallet.id,
          montant: Math.floor(Math.random() * 50000) + 5000,
          statut: TransactionStatus.REUSSI,
        });
      }
    }

    // Sauvegarder les transactions
    for (const t of transactionsData) {
      await this.transactionRepo.save(
        this.transactionRepo.create({
          walletSource: t.walletSource,
          walletDestination: t.walletDestination,
          montant: t.montant,
          devise: 'XOF',
          type: t.type,
          referenceExterne: `REF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          fournisseur:
            fournisseurs[Math.floor(Math.random() * fournisseurs.length)],
          fournisseurRef: `Fourn-${Math.random().toString(36).substring(2, 8)}`,
          statut: t.statut,
          fraisPsp: Math.floor(t.montant * 0.015),
          fraisPlateforme: Math.floor(t.montant * 0.01),
        }),
      );
    }

    this.logger.log(`✅ ${transactionsData.length} transactions créées`);

    // ============================================================
    // 10. NOTIFICATIONS (50+ notifications)
    // ============================================================
    this.logger.log('🔔 Création des notifications...');

    const notificationTemplates = [
      'INVESTISSEMENT_CONFIRME',
      'KYC_VALIDE',
      'PROJET_ANNONCE',
      'ECHEANCE_PAYEE',
      'RESERVATION_VALIDEE',
      'RETRAIT_EFFECTUE',
      'DEPOT_RECU',
      'NOUVEAU_PROJET',
      'REMBOURSEMENT_EFFECTUE',
      'DOCUMENT_A_SIGNER',
    ];
    const canaux = Object.values(NotificationCanal);
    const statutsNotif = ['envoye', 'delivre', 'lu', 'echec'];

    for (const user of [...investisseursPP, ...investisseursPM]) {
      const numNotifications = Math.floor(Math.random() * 8) + 3;

      for (let i = 0; i < numNotifications; i++) {
        await this.notificationRepo.save(
          this.notificationRepo.create({
            utilisateurId: user.userId,
            canal: canaux[Math.floor(Math.random() * canaux.length)],
            templateCode:
              notificationTemplates[
                Math.floor(Math.random() * notificationTemplates.length)
              ],
            statut:
              statutsNotif[Math.floor(Math.random() * statutsNotif.length)],
            envoyeLe: new Date(
              Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000,
            ),
            metadata: {
              projectId: Math.random() > 0.5 ? crypto.randomUUID() : null,
            },
          }),
        );
      }
    }

    this.logger.log('✅ Notifications créées');

    // ============================================================
    // 11. AUDIT LOGS (100+ logs d'audit)
    // ============================================================
    this.logger.log("📋 Création des logs d'audit...");

    const actions = [
      'USER_LOGIN',
      'USER_REGISTER',
      'KYC_SUBMIT',
      'INVESTMENT_CREATE',
      'INVESTMENT_SIGN',
      'PROJECT_CREATE',
      'PROJECT_UPDATE',
      'WALLET_DEPOSIT',
      'WALLET_WITHDRAW',
      'DOCUMENT_UPLOAD',
      'RESERVATION_CREATE',
      'RESERVATION_CANCEL',
      'SETTINGS_UPDATE',
      'EMAIL_CHANGE',
      'PASSWORD_CHANGE',
    ];
    const roles = Object.values(UserRole);

    for (let i = 0; i < 150; i++) {
      const user = savedUsers[Math.floor(Math.random() * savedUsers.length)];
      const action = actions[Math.floor(Math.random() * actions.length)];

      await this.auditLogRepo.save(
        this.auditLogRepo.create({
          acteurId: crypto.randomUUID(),
          role: user.role,
          action,
          objetType: ['USER', 'PROJECT', 'INVESTMENT', 'WALLET', 'DOCUMENT'][
            Math.floor(Math.random() * 5)
          ],
          objetId: crypto.randomUUID(),
          ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          metadata: {
            userId: user.userId,
            timestamp: new Date().toISOString(),
          },
        }),
      );
    }

    this.logger.log("✅ Logs d'audit créés");

    // ============================================================
    // 12. DOCUMENTS (documents KYC, prospectus + photos de projets)
    // ============================================================
    this.logger.log('📄 Création des documents...');

    const kycDocTypes = [
      DocumentType.IDENTITE,
      DocumentType.JUSTIFICATIF_DOMICILE,
      DocumentType.JUSTIFICATIF_REVENU,
    ];
    const projectDocTypes = [
      DocumentType.PROSPECTUS,
      DocumentType.RAPPORT_FINANCIER,
      DocumentType.PERMIS_CONSTRUIRE,
      DocumentType.KBIS,
    ];

    // Documents KYC pour les investisseurs
    for (let i = 0; i < 20; i++) {
      const user = savedUsers[Math.floor(Math.random() * savedUsers.length)];
      await this.documentRepo.save(
        this.documentRepo.create({
          type: kycDocTypes[Math.floor(Math.random() * kycDocTypes.length)] as any,
          relatedTo: DocumentRelatedTo.USER as any,
          userId: user.userId,
          projectId: null,
          investmentId: null,
          originalName: `kyc_document_${i + 1}.pdf`,
          filename: `doc_${Date.now()}_${i + 1}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: Math.floor(Math.random() * 2000000) + 50000,
          path: `/uploads/documents/${Date.now()}_${i + 1}.pdf`,
          isPublic: false,
          uploadedBy: user.userId,
          ordre: null,
          estPrincipale: false,
        } as any),
      );
    }

    // Documents projet (prospectus, rapports) pour les projets publiés
    const publishedProjects = savedProjects.filter((p) =>
      [
        ProjectStatus.EN_COLLECTE,
        ProjectStatus.ANNONCE,
        ProjectStatus.PRE_INVESTISSEMENT,
        ProjectStatus.FINANCE,
        ProjectStatus.EN_EXPLOITATION,
        ProjectStatus.CLOTURE,
      ].includes(p.statut),
    );

    for (const project of publishedProjects) {
      const numDocs = Math.floor(Math.random() * 2) + 1;
      for (let i = 0; i < numDocs; i++) {
        await this.documentRepo.save(
          this.documentRepo.create({
            type: projectDocTypes[Math.floor(Math.random() * projectDocTypes.length)] as any,
            relatedTo: DocumentRelatedTo.PROJECT as any,
            userId: null,
            projectId: project.id,
            investmentId: null,
            originalName: `projet_doc_${i + 1}.pdf`,
            filename: `proj_${Date.now()}_${i + 1}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: Math.floor(Math.random() * 5000000) + 100000,
            path: `/uploads/documents/${Date.now()}_${i + 1}.pdf`,
            isPublic: true,
            uploadedBy: staffUsers[0].userId,
            ordre: null,
            estPrincipale: false,
          } as any),
        );
      }

      // Photos du projet (3 à 5 images par projet publié)
      const numPhotos = Math.floor(Math.random() * 3) + 3;
      for (let i = 0; i < numPhotos; i++) {
        await this.documentRepo.save(
          this.documentRepo.create({
            type: DocumentType.PHOTO_PROJET as any,
            relatedTo: DocumentRelatedTo.PROJECT as any,
            userId: null,
            projectId: project.id,
            investmentId: null,
            originalName: `photo_${i + 1}.jpg`,
            filename: `photo_${project.id.slice(0, 8)}_${Date.now()}_${i + 1}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: Math.floor(Math.random() * 3000000) + 200000,
            path: `/uploads/photos/${project.id.slice(0, 8)}_${Date.now()}_${i + 1}.jpg`,
            isPublic: true,
            uploadedBy: staffUsers[0].userId,
            ordre: i,
            estPrincipale: i === 0,
          } as any),
        );
      }
    }

    this.logger.log('✅ Documents créés');

    // ============================================================
    // 13. ORDRES DE MARCHÉ SECONDARY MARKET (15+ ordres)
    // ============================================================
    this.logger.log('📊 Création des ordres de marché...');

    const eligibleInvestments = savedInvestments.filter((i) =>
      [InvestmentStatus.CONFIRME, InvestmentStatus.REMBOURSE_CAPITAL].includes(
        i.statut,
      ),
    );

    const ordreStatuses = Object.values(OrdreMarcheStatus);

    for (let i = 0; i < 20; i++) {
      const investment =
        eligibleInvestments[
          Math.floor(Math.random() * eligibleInvestments.length)
        ];
      if (!investment) continue;

      const statut =
        ordreStatuses[Math.floor(Math.random() * ordreStatuses.length)];
      const montant = Number(investment.montant) * (0.2 + Math.random() * 0.5);

      await this.ordreMarcheRepo.save(
        this.ordreMarcheRepo.create({
          investissementId: investment.id,
          vendeurId: investment.utilisateurId,
          acheteurId:
            statut === OrdreMarcheStatus.EXECUTE
              ? investisseursPP[
                  Math.floor(Math.random() * investisseursPP.length)
                ].userId
              : null,
          sens: OrdreMarcheSens.VENTE,
          montant,
          prixUnitaire: montant / (investment.nbTitres || 100),
          statut,
          valideJusquAu: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }),
      );
    }

    this.logger.log('✅ Ordres de marché créés');

    // ============================================================
    // 14. AVIS (notes et commentaires sur les projets publiés)
    // ============================================================
    this.logger.log('⭐ Création des avis...');

    const avisCommentaires = [
      'Très bon projet, équipe sérieuse et transparente.',
      'Rendement attractif, j\'ai investi sans hésiter.',
      'Bonne localisation, quartier en forte demande.',
      'Projet solide, documentation claire et complète.',
      'J\'apprécie la régularité des reporting.',
      'Taux de rendement compétitif pour le marché local.',
      'Projet bien structuré, promoteur fiable.',
      null,
      null,
      'Délais respectés jusqu\'ici, je recommande.',
    ];

    let avisCount = 0;
    const usedPairs = new Set<string>();

    for (const project of publishedProjects) {
      const numAvis = Math.floor(Math.random() * 6) + 3;
      const shuffled = [...investisseursPP].sort(() => Math.random() - 0.5);

      for (let i = 0; i < Math.min(numAvis, shuffled.length); i++) {
        const user = shuffled[i];
        const key = `${user.userId}-${project.id}`;
        if (usedPairs.has(key)) continue;
        usedPairs.add(key);

        await this.avisRepo.save(
          this.avisRepo.create({
            projetId: project.id,
            userId: user.userId,
            note: Math.floor(Math.random() * 3) + 3,
            commentaire:
              avisCommentaires[Math.floor(Math.random() * avisCommentaires.length)],
          }),
        );
        avisCount++;
      }
    }

    this.logger.log(`✅ ${avisCount} avis créés`);

    // ============================================================
    // RÉSUMÉ FINAL
    // ============================================================
    this.logger.log(
      '═══════════════════════════════════════════════════════════',
    );
    this.logger.log('✅ SEED TERMINÉ AVEC SUCCÈS !');
    this.logger.log(
      '═══════════════════════════════════════════════════════════',
    );
    this.logger.log(`👥 Utilisateurs: ${savedUsers.length}`);
    this.logger.log(`🏢 SPVs: ${savedSpvs.length}`);
    this.logger.log(`🏗️ Projets: ${savedProjects.length}`);
    this.logger.log(`💰 Wallets: ${(await this.walletRepo.find()).length}`);
    this.logger.log(`📈 Investissements: ${savedInvestments.length}`);
    this.logger.log(`📅 Échéances: ${echeanceCount}`);
    this.logger.log(`🎫 Réservations: ${reservationCount}`);
    this.logger.log(`💳 Transactions: ${transactionsData.length}`);
    this.logger.log(
      `🔔 Notifications: ${(await this.notificationRepo.find()).length}`,
    );
    this.logger.log(
      `📋 Logs d'audit: ${(await this.auditLogRepo.find()).length}`,
    );
    this.logger.log(`📄 Documents: ${(await this.documentRepo.find()).length}`);
    this.logger.log(
      `📊 Ordres de marché: ${(await this.ordreMarcheRepo.find()).length}`,
    );
    this.logger.log(
      '═══════════════════════════════════════════════════════════',
    );
  }
}

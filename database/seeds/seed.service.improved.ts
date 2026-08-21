import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
  CategorieInvestisseur,
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

// Configuration interface pour le seed
interface SeedConfig {
  force?: boolean;
  userCount?: number;
  projectCount?: number;
  spvCount?: number;
  enableLogging?: boolean;
  batchSize?: number;
}

// Types de données pour une meilleure organisation
interface UserData {
  firstname: string;
  lastname: string;
  email: string;
  role: UserRole;
}

interface ProjectData {
  slug: string;
  titre: string;
  type: ProjectType;
  statut: ProjectStatus;
  ville: string;
  region: string;
  pays: string;
  adresseComplete: string;
  latitude: number;
  longitude: number;
  youtubeUrl?: string;
  capitalCible: number;
  capitalMinimum: number;
  ticketMinimum: number;
  ticketMaximum: number;
  nbFractions: number;
  triCible: number;
  dureeMois: number;
  instrument: ProjectInstrument;
  estPreInvestissable: boolean;
  plafondPreInvestissement?: number;
  porteurIndex: number;
  spvIndex: number;
  descriptionMd: string;
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly dataSource: DataSource,
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

  /**
   * Point d'entrée principal pour le seed
   */
  async seed(config: SeedConfig = {}): Promise<void> {
    const startTime = Date.now();
    this.logger.log('🚀 Début du seed amélioré...');

    try {
      // Validation de la configuration
      const finalConfig = this.validateConfig(config);

      // Vérification si le seed est nécessaire
      if (!finalConfig.force && (await this.isAlreadySeeded())) {
        this.logger.log(
          '⚠️ Seed déjà effectué — utilisez force: true pour forcer.',
        );
        return;
      }

      // Nettoyage si forcé
      if (finalConfig.force) {
        await this.cleanDatabase();
      }

      // Exécution par étapes avec transaction
      await this.dataSource.transaction(async (manager) => {
        await this.seedUsers(manager, finalConfig);
        await this.seedProfilesAndKyc(manager, finalConfig);
        await this.seedSpvs(manager, finalConfig);
        await this.seedProjects(manager, finalConfig);
        await this.seedWallets(manager, finalConfig);
        await this.seedInvestments(manager, finalConfig);
        await this.seedSecondaryMarket(manager, finalConfig);
        await this.seedDocuments(manager, finalConfig);
        await this.seedNotifications(manager, finalConfig);
      });

      const duration = (Date.now() - startTime) / 1000;
      this.logger.log(`✅ Seed terminé avec succès en ${duration}s`);
    } catch (error) {
      this.logger.error('❌ Erreur critique lors du seed:', error);
      throw error;
    }
  }

  /**
   * Validation et normalisation de la configuration
   */
  private validateConfig(config: SeedConfig): Required<SeedConfig> {
    return {
      force: config.force ?? false,
      userCount: config.userCount ?? 30,
      projectCount: config.projectCount ?? 15,
      spvCount: config.spvCount ?? 8,
      enableLogging: config.enableLogging ?? true,
      batchSize: config.batchSize ?? 50,
    };
  }

  /**
   * Vérifie si la base de données contient déjà des données
   */
  private async isAlreadySeeded(): Promise<boolean> {
    const adminCount = await this.userRepo.count({
      where: { role: UserRole.SUPER_ADMIN },
    });
    return adminCount > 0;
  }

  /**
   * Nettoyage complet de la base de données
   */
  private async cleanDatabase(): Promise<void> {
    this.logger.log('🧹 Nettoyage de la base de données...');

    // Ordre de suppression important pour respecter les contraintes de clé étrangère
    const tables = [
      'ordre_marche',
      'echeance',
      'transaction',
      'investment',
      'reservation',
      'wallet',
      'notification',
      'audit_log',
      'document',
      'kyc',
      'profil_pm',
      'profil_pp',
      'project',
      'spv',
      'user_email',
      'user',
    ];

    for (const table of tables) {
      try {
        await this.dataSource.query(`DELETE FROM ${table}`);
        this.logger.debug(`✅ Table ${table} nettoyée`);
      } catch (error) {
        this.logger.warn(
          `⚠️ Impossible de nettoyer la table ${table}:`,
          error.message,
        );
      }
    }
  }

  /**
   * Création des utilisateurs avec données réalistes
   */
  private async seedUsers(
    manager: any,
    config: Required<SeedConfig>,
  ): Promise<void> {
    this.logger.log('👥 Création des utilisateurs...');

    const hashedPassword = await bcrypt.hash('BeOwn@2025!', 12);
    const hashedPasswordUser = await bcrypt.hash('Investisseur@2025!', 12);

    const usersData: UserData[] = this.generateUserData(config.userCount);

    const savedUsers: UserEntity[] = [];
    const timestamp = Date.now();

    // Traitement par batch pour optimiser la performance
    for (let i = 0; i < usersData.length; i += config.batchSize) {
      const batch = usersData.slice(i, i + config.batchSize);

      for (const userData of batch) {
        try {
          const user = manager.create(UserEntity, {
            firstname: userData.firstname,
            lastname: userData.lastname,
            password: [UserRole.INVESTISSEUR, UserRole.PORTEUR].includes(
              userData.role,
            )
              ? hashedPasswordUser
              : hashedPassword,
            role: userData.role,
            status: UserStatus.ACTIF,
            cguAccepteesLe: this.randomDate(-365, 0),
            lastLoginAt: Math.random() > 0.3 ? this.randomDate(-30, 0) : null,
          });

          const savedUser = await manager.save(user);

          // Email unique avec timestamp
          const emailEntity = manager.create(UserEmailEntity, {
            email: userData.email.replace('@', `+${timestamp}${i}@`),
            isVerified: true,
            verifiedDate: this.randomDate(-180, 0),
            user: savedUser,
          });
          await manager.save(emailEntity);

          savedUsers.push(savedUser);
        } catch (error) {
          this.logger.error(
            `❌ Erreur création utilisateur ${userData.email}:`,
            error,
          );
          throw error;
        }
      }
    }

    this.logger.log(`✅ ${savedUsers.length} utilisateurs créés`);
    this.storeUsers(savedUsers);
  }

  /**
   * Génération de données utilisateurs réalistes
   */
  private generateUserData(count: number): UserData[] {
    const staffData: UserData[] = [
      {
        firstname: 'Admin',
        lastname: 'BeOwn',
        email: 'admin@beown.fr',
        role: UserRole.SUPER_ADMIN,
      },
      {
        firstname: 'Marie',
        lastname: 'Compliance',
        email: 'compliance@beown.fr',
        role: UserRole.COMPLIANCE,
      },
      {
        firstname: 'Jean',
        lastname: 'RCCI',
        email: 'rcci@beown.fr',
        role: UserRole.RCCI,
      },
      {
        firstname: 'Pierre',
        lastname: 'Financier',
        email: 'financier@beown.fr',
        role: UserRole.FINANCIER,
      },
      {
        firstname: 'Sophie',
        lastname: 'Support',
        email: 'support@beown.fr',
        role: UserRole.SUPPORT,
      },
      {
        firstname: 'Lucas',
        lastname: 'DPO',
        email: 'dpo@beown.fr',
        role: UserRole.DPO,
      },
      {
        firstname: 'Chloé',
        lastname: 'CIO',
        email: 'cio@beown.fr',
        role: UserRole.CIO,
      },
      {
        firstname: 'Marc',
        lastname: 'Marketing',
        email: 'marketing@beown.fr',
        role: UserRole.MARKETING,
      },
      {
        firstname: 'Awa',
        lastname: 'Analyste',
        email: 'analyste@beown.fr',
        role: UserRole.ANALYSTE_FINANCIER,
      },
      {
        firstname: 'Paul',
        lastname: 'Relation',
        email: 'relation@beown.fr',
        role: UserRole.CHARGE_RELATION_INVESTISSEUR,
      },
    ];

    const nomsSenegalais = [
      'Diallo',
      'Sow',
      'Ndiaye',
      'Ba',
      'Fall',
      'Gueye',
      'Sy',
      'Diop',
      'Seck',
      'Faye',
    ];
    const nomsIvoiriens = [
      'Kouassi',
      'Bakayoko',
      "N'Guessan",
      'Koné',
      'Touré',
      'Ouattara',
    ];
    const nomsMaliens = [
      'Traoré',
      'Touré',
      'Keïta',
      'Sidibé',
      'Cissoko',
      'Doucouré',
    ];

    const prenoms = [
      'Amadou',
      'Fatou',
      'Moussa',
      'Aïssatou',
      'Ousmane',
      'Mariama',
      'Ibrahima',
      'Aminata',
      'Kouamé',
      'Ahou',
      'Yao',
      'Akissi',
      'Moussa',
      'Fatoumata',
      'Bakary',
      'Abdoulaye',
      'Ndeye',
      'Serigne',
      'Koffi',
      'Marie-Louise',
      'Mamadou',
    ];

    const investorsData: UserData[] = [];
    const porteursData: UserData[] = [];

    // Générer les investisseurs
    for (let i = 0; i < count - staffData.length - 6; i++) {
      const nom = [...nomsSenegalais, ...nomsIvoiriens, ...nomsMaliens][
        Math.floor(Math.random() * 20)
      ];
      const prenom = prenoms[Math.floor(Math.random() * prenoms.length)];
      const pays = ['SN', 'CI', 'ML'][Math.floor(Math.random() * 3)];

      investorsData.push({
        firstname: prenom,
        lastname: nom,
        email: `${prenom.toLowerCase()}.${nom.toLowerCase()}@email.${pays.toLowerCase()}`,
        role: UserRole.INVESTISSEUR,
      });
    }

    // Générer les porteurs de projets
    for (let i = 0; i < 6; i++) {
      const nom = [...nomsSenegalais, ...nomsIvoiriens, ...nomsMaliens][i % 18];
      const prenom = prenoms[i % 21];
      const pays = ['SN', 'CI', 'ML'][i % 3];

      porteursData.push({
        firstname: prenom,
        lastname: nom,
        email: `${prenom.toLowerCase()}@${nom.toLowerCase().replace(' ', '')}.${pays.toLowerCase()}`,
        role: UserRole.PORTEUR,
      });
    }

    return [
      ...staffData,
      ...investorsData.slice(0, count - staffData.length - 6),
      ...porteursData,
    ];
  }

  /**
   * Création des profils et KYC
   */
  private async seedProfilesAndKyc(
    manager: any,
    config: Required<SeedConfig>,
  ): Promise<void> {
    this.logger.log('📝 Création des profils et KYC...');

    const { staffUsers, investisseursPP, investisseursPM } =
      this.getStoredUsers();

    // Profils Personnes Physiques
    for (const user of investisseursPP) {
      await this.createProfilPP(manager, user);
      await this.createKyc(manager, user.userId, KycStatus.VALIDE);
    }

    // Profils Personnes Morales
    for (let i = 0; i < investisseursPM.length; i++) {
      await this.createProfilPM(manager, investisseursPM[i], i);
      await this.createKyc(
        manager,
        investisseursPM[i].userId,
        KycStatus.VALIDE,
        KycNiveau.RENFORCE,
      );
    }

    this.logger.log('✅ Profils et KYC créés');
  }

  /**
   * Création d'un profil personne physique
   */
  private async createProfilPP(manager: any, user: UserEntity): Promise<void> {
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
    const villes = [
      'Dakar',
      'Abidjan',
      'Bamako',
      'Thiès',
      'Kaolack',
      'Ouagadougou',
    ];

    const birthDate = this.randomDate(-70, -18);

    const profilPP = manager.create(ProfilPPEntity, {
      utilisateurId: user.userId,
      civilite: civilites[Math.floor(Math.random() * civilites.length)],
      prenom: user.firstname,
      nom: user.lastname,
      nomNaissance: Math.random() > 0.8 ? user.lastname : undefined,
      dateNaissance: birthDate,
      lieuNaissance: villes[Math.floor(Math.random() * villes.length)],
      paysNaissance:
        nationalites[Math.floor(Math.random() * nationalites.length)],
      nationalite:
        nationalites[Math.floor(Math.random() * nationalites.length)],
      adresseLigne1: `${Math.floor(Math.random() * 999) + 1} Rue des Investisseurs`,
      adresseLigne2:
        Math.random() > 0.5
          ? `Appartement ${Math.floor(Math.random() * 50) + 1}`
          : undefined,
      codePostal: String(Math.floor(Math.random() * 90000) + 10000) as any,
      ville: villes[Math.floor(Math.random() * villes.length)],
      pays: nationalites[Math.floor(Math.random() * 3)],
      telephone:
        `+221${Math.floor(Math.random() * 90000000) + 70000000}` as any,
      profession: professions[Math.floor(Math.random() * professions.length)],
      secteurActivite: [
        'Immobilier',
        'Technologie',
        'Finance',
        'Santé',
        'Éducation',
        'Agriculture',
      ][Math.floor(Math.random() * 6)],
      pep: Math.random() > 0.95,
      residenceFiscale: nationalites[Math.floor(Math.random() * 3)],
      nif:
        Math.random() > 0.3
          ? `NIF${Math.floor(Math.random() * 900000000) + 100000000}`
          : undefined,
      categoriePsfp: [
        CategorieInvestisseur.NON_AVERTI,
        CategorieInvestisseur.AVERTI,
        CategorieInvestisseur.AVERTI,
      ][Math.floor(Math.random() * 3)],
    });

    await manager.save(profilPP);
  }

  /**
   * Création d'un profil personne morale
   */
  private async createProfilPM(
    manager: any,
    user: UserEntity,
    index: number,
  ): Promise<void> {
    const pmData = [
      {
        raisonSociale: 'Diallo Invest SARL',
        formeJuridique: 'SARL',
        siren: 'SN123456789',
        capitalSocial: 100_000,
      },
      {
        raisonSociale: 'Techno Plus CI',
        formeJuridique: 'SA',
        siren: 'CI987654321',
        capitalSocial: 250_000,
      },
      {
        raisonSociale: 'Global Finance Mali',
        formeJuridique: 'SAS',
        siren: 'ML456789123',
        capitalSocial: 150_000,
      },
    ];

    const pm = pmData[index % pmData.length];

    const profilPM = manager.create(ProfilPMEntity, {
      utilisateurId: user.userId,
      raisonSociale: pm.raisonSociale,
      formeJuridique: pm.formeJuridique,
      siren: pm.siren,
      rcsVille: ['Dakar', 'Abidjan', 'Bamako'][index % 3],
      capitalSocial: pm.capitalSocial,
      siegeAdresse: `${Math.floor(Math.random() * 999) + 1} Avenue de la Finance`,
      representantId: this.getStoredUsers().investisseursPP[0]?.userId,
      secteurActivite: ['Immobilier', 'Technologie', 'Finance'][index % 3],
    });

    await manager.save(profilPM);
  }

  /**
   * Création d'un KYC
   */
  private async createKyc(
    manager: any,
    userId: number,
    statut: KycStatus,
    niveau?: KycNiveau,
  ): Promise<void> {
    const kyc = manager.create(KycEntity, {
      utilisateurId: userId,
      statut,
      niveau:
        niveau ??
        [KycNiveau.STANDARD, KycNiveau.SIMPLE, KycNiveau.RENFORCE][
          Math.floor(Math.random() * 3)
        ],
      scoreRisque: Math.floor(Math.random() * 100),
      fournisseur: 'stripe',
      fournisseurRef: `kyc_${userId}_${Date.now()}`,
      valideJusquAu:
        statut === KycStatus.VALIDE ? this.randomDate(365, 365) : null,
    });

    await manager.save(kyc);
  }

  /**
   * Création des SPVs
   */
  private async seedSpvs(
    manager: any,
    config: Required<SeedConfig>,
  ): Promise<void> {
    this.logger.log('🏢 Création des SPVs...');

    const spvData = this.generateSpvData(config.spvCount);
    const savedSpvs: SpvEntity[] = [];

    for (const spv of spvData) {
      const saved = await manager.save(
        manager.create(SpvEntity, {
          ...spv,
          iban: `SN08SN010015${String(savedSpvs.length + 1).padStart(9, '0')}`,
        }),
      );
      savedSpvs.push(saved);
    }

    this.logger.log(`✅ ${savedSpvs.length} SPVs créés`);
    this.storeSpvs(savedSpvs);
  }

  /**
   * Génération des données SPV
   */
  private generateSpvData(count: number): any[] {
    const villes = ['Dakar', 'Abidjan', 'Bamako', 'Ouagadougou', 'Lomé'];
    const pays = ['Sénégal', "Côte d'Ivoire", 'Mali', 'Burkina Faso', 'Togo'];

    return Array.from({ length: count }, (_, i) => ({
      raisonSociale: `BeOwn SPV ${i + 1} SAS`,
      siren: `900${String(i + 1).padStart(8, '0')}`,
      forme: 'SAS',
      capitalSocial: 10000,
      siegeAdresse: `${villes[i % villes.length]}, ${pays[i % pays.length]}`,
    }));
  }

  /**
   * Création des projets
   */
  private async seedProjects(
    manager: any,
    config: Required<SeedConfig>,
  ): Promise<void> {
    this.logger.log('🏗️ Création des projets...');

    const projectsData = this.generateProjectData(config.projectCount);
    const { porteurs, spvs } = this.getStoredUsersAndSpvs();
    const savedProjects: ProjectEntity[] = [];

    for (let i = 0; i < projectsData.length; i++) {
      const projectData = projectsData[i];
      const porteur = porteurs[i % porteurs.length];
      const spv = spvs[i % spvs.length];

      const project = manager.create(ProjectEntity, {
        ...projectData,
        porteurId: porteur.userId,
        spvId: spv.id,
        dateCreation: this.randomDate(-60, -15),
        dateModification: new Date(),
      });

      const saved = await manager.save(project);
      savedProjects.push(saved);
    }

    this.logger.log(`✅ ${savedProjects.length} projets créés`);
    this.storeProjects(savedProjects);
  }

  /**
   * Génération des données projets
   */
  private generateProjectData(count: number): ProjectData[] {
    const projets = [
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
        capitalCible: 500_000,
        capitalMinimum: 300_000,
        ticketMinimum: 100,
        ticketMaximum: 50_000,
        nbFractions: 5_000,
        triCible: 12.5,
        dureeMois: 24,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: true,
        plafondPreInvestissement: 200_000,
        porteurIndex: 0,
        spvIndex: 0,
        descriptionMd: `## Résidence Dakar Plateau — Investissez au cœur de la capitale

Situé au **Plateau**, le centre d'affaires historique de Dakar, ce projet résidentiel de haut standing vise à réhabiliter un immeuble R+5 en logements locatifs premium.`,
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
        capitalCible: 800_000,
        capitalMinimum: 500_000,
        ticketMinimum: 100,
        ticketMaximum: 100_000,
        nbFractions: 8_000,
        triCible: 9.0,
        dureeMois: 36,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: true,
        plafondPreInvestissement: 300_000,
        porteurIndex: 1,
        spvIndex: 1,
        descriptionMd: `## Immeuble Commercial Abidjan Plateau — Le cœur économique d'Afrique de l'Ouest

Cet immeuble de bureaux R+6 est idéalement positionné sur le **Boulevard de la République**, artère principale du Plateau d'Abidjan.`,
      },
      // Ajouter d'autres projets selon le besoin...
    ];

    return projets.slice(0, count);
  }

  /**
   * Création des wallets
   */
  private async seedWallets(
    manager: any,
    config: Required<SeedConfig>,
  ): Promise<void> {
    this.logger.log('💰 Création des wallets...');

    const { investisseursPP, investisseursPM, staffUsers } =
      this.getStoredUsers();
    const allUsers = [...investisseursPP, ...investisseursPM, ...staffUsers];

    for (const user of allUsers) {
      const wallet = manager.create(WalletEntity, {
        utilisateurId: user.userId,
        type: [UserRole.INVESTISSEUR, UserRole.PORTEUR].includes(user.role)
          ? WalletType.INVESTISSEUR
          : WalletType.TECHNIQUE_PROJET,
        solde:
          Math.random() > 0.5
            ? Math.floor(Math.random() * 19_000) + 1_000
            : 0,
        devise: 'EUR',
        dateCreation: this.randomDate(-365, 0),
        estActif: true,
      });

      await manager.save(wallet);
    }

    this.logger.log(`✅ ${allUsers.length} wallets créés`);
  }

  /**
   * Création des investissements
   */
  private async seedInvestments(
    manager: any,
    config: Required<SeedConfig>,
  ): Promise<void> {
    this.logger.log('📈 Création des investissements...');

    const { investisseursPP, investisseursPM } = this.getStoredUsers();
    const projects = this.getStoredProjects();
    const allInvestors = [...investisseursPP, ...investisseursPM];

    const savedInvestments: InvestmentEntity[] = [];

    for (const project of projects) {
      const investorCount = Math.floor(Math.random() * 15) + 5;

      for (let i = 0; i < investorCount; i++) {
        const investor =
          allInvestors[Math.floor(Math.random() * allInvestors.length)];
        const montant =
          Math.floor(
            Math.random() *
              ((project.ticketMaximum || project.ticketMinimum * 10) -
                project.ticketMinimum),
          ) + project.ticketMinimum;

        const investment = manager.create(InvestmentEntity, {
          utilisateurId: investor.userId,
          projetId: project.id,
          montant,
          nbTitres: Math.floor(montant / project.ticketMinimum),
          prixUnitaire: project.ticketMinimum,
          statut: this.getRandomInvestmentStatus(),
          dateInvestissement: this.randomDate(-30, 0),
          dateValidation: Math.random() > 0.3 ? new Date() : null,
        });

        const saved = await manager.save(investment);
        savedInvestments.push(saved);
      }
    }

    this.logger.log(`✅ ${savedInvestments.length} investissements créés`);
    this.storeInvestments(savedInvestments);
  }

  /**
   * Création du marché secondaire
   */
  private async seedSecondaryMarket(
    manager: any,
    config: Required<SeedConfig>,
  ): Promise<void> {
    this.logger.log('📊 Création des ordres de marché secondaire...');

    const investments = this.getStoredInvestments().filter((i) =>
      [InvestmentStatus.CONFIRME, InvestmentStatus.REMBOURSE_CAPITAL].includes(
        i.statut,
      ),
    );
    const { investisseursPP } = this.getStoredUsers();

    for (let i = 0; i < Math.min(20, investments.length); i++) {
      const investment = investments[i];
      const montant = Number(investment.montant) * (0.2 + Math.random() * 0.5);

      const ordre = manager.create(OrdreMarcheEntity, {
        investissementId: investment.id,
        vendeurId: investment.utilisateurId,
        acheteurId:
          Math.random() > 0.7
            ? investisseursPP[
                Math.floor(Math.random() * investisseursPP.length)
              ].userId
            : null,
        sens: OrdreMarcheSens.VENTE,
        montant,
        prixUnitaire: montant / (investment.nbTitres || 100),
        statut: this.getRandomOrdreStatus(),
        dateCreation: this.randomDate(-15, 0),
        dateExecution: Math.random() > 0.6 ? new Date() : null,
      });

      await manager.save(ordre);
    }

    this.logger.log('✅ Ordres de marché secondaire créés');
  }

  /**
   * Création des documents
   */
  private async seedDocuments(
    manager: any,
    config: Required<SeedConfig>,
  ): Promise<void> {
    this.logger.log('📄 Création des documents...');

    const projects = this.getStoredProjects();
    const { staffUsers } = this.getStoredUsers();

    for (const project of projects) {
      const documentTypes = [
        DocumentType.PHOTO_PROJET,
        DocumentType.PERMIS_CONSTRUIRE,
        DocumentType.PROSPECTUS,
        DocumentType.RAPPORT_FINANCIER,
      ];

      for (let i = 0; i < documentTypes.length; i++) {
        const docType = documentTypes[i];
        const document = manager.create(DocumentEntity, {
          titre: `${project.titre} - ${this.getDocumentTypeName(docType)}`,
          type: docType,
          relatedTo: DocumentRelatedTo.PROJECT,
          relatedId: project.id,
          cheminFichier: `/uploads/docs/${project.id.slice(0, 8)}_${Date.now()}_${i + 1}.pdf`,
          tailleFichier: Math.floor(Math.random() * 5000000) + 1000000,
          typeMime: 'application/pdf',
          estPublic: docType !== DocumentType.PERMIS_CONSTRUIRE,
          uploadedBy: staffUsers[0].userId,
          dateUpload: this.randomDate(-60, 0),
        });

        await manager.save(document);
      }
    }

    this.logger.log('✅ Documents créés');
  }

  /**
   * Création des notifications
   */
  private async seedNotifications(
    manager: any,
    config: Required<SeedConfig>,
  ): Promise<void> {
    this.logger.log('🔔 Création des notifications...');

    const { investisseursPP } = this.getStoredUsers();
    const projects = this.getStoredProjects();

    for (const user of investisseursPP.slice(0, 10)) {
      for (let i = 0; i < 5; i++) {
        const project = projects[Math.floor(Math.random() * projects.length)];

        const notification = manager.create(NotificationEntity, {
          utilisateurId: user.userId,
          titre: `Nouveau projet : ${project.titre}`,
          message: `Découvrez ${project.titre}, une opportunité d'investissement à ${project.triCible}%`,
          canal: NotificationCanal.EMAIL,
          estLue: Math.random() > 0.6,
          dateEnvoi: this.randomDate(-30, 0),
          donneesSupplementaires: { projectId: project.id },
        });

        await manager.save(notification);
      }
    }

    this.logger.log('✅ Notifications créées');
  }

  // ========================================================================
  // UTILITAIRES
  // ========================================================================

  private storedUsers: {
    staffUsers: UserEntity[];
    investisseursPP: UserEntity[];
    investisseursPM: UserEntity[];
    porteurs: UserEntity[];
  } | null = null;

  private storedSpvs: SpvEntity[] | null = null;
  private storedProjects: ProjectEntity[] | null = null;
  private storedInvestments: InvestmentEntity[] | null = null;

  private storeUsers(users: UserEntity[]): void {
    this.storedUsers = {
      staffUsers: users.filter(
        (u) => ![UserRole.INVESTISSEUR, UserRole.PORTEUR].includes(u.role),
      ),
      investisseursPP: users.filter((u) => u.role === UserRole.INVESTISSEUR),
      investisseursPM: users.filter(
        (u) => u.role === UserRole.INVESTISSEUR && Math.random() > 0.8,
      ), // Simplifié pour l'exemple
      porteurs: users.filter((u) => u.role === UserRole.PORTEUR),
    };
  }

  private storeSpvs(spvs: SpvEntity[]): void {
    this.storedSpvs = spvs;
  }

  private storeProjects(projects: ProjectEntity[]): void {
    this.storedProjects = projects;
  }

  private storeInvestments(investments: InvestmentEntity[]): void {
    this.storedInvestments = investments;
  }

  private getStoredUsers() {
    if (!this.storedUsers) throw new Error('Users not stored yet');
    return this.storedUsers!;
  }

  private getStoredUsersAndSpvs() {
    const users = this.getStoredUsers();
    return {
      ...users,
      spvs: this.storedSpvs || [],
    };
  }

  private getStoredSpvs() {
    if (!this.storedSpvs) throw new Error('SPVs not stored yet');
    return this.storedSpvs!;
  }

  private getStoredProjects() {
    if (!this.storedProjects) throw new Error('Projects not stored yet');
    return this.storedProjects!;
  }

  private getStoredInvestments() {
    if (!this.storedInvestments) throw new Error('Investments not stored yet');
    return this.storedInvestments!;
  }

  private randomDate(daysMin: number, daysMax: number): Date {
    const now = Date.now();
    const randomDays =
      Math.floor(Math.random() * (daysMax - daysMin + 1)) + daysMin;
    return new Date(now + randomDays * 24 * 60 * 60 * 1000);
  }

  private getRandomInvestmentStatus(): InvestmentStatus {
    const statuses = [
      InvestmentStatus.PAYE,
      InvestmentStatus.CONFIRME,
      InvestmentStatus.REMBOURSE_CAPITAL,
      InvestmentStatus.REMBOURSE_TOTAL,
    ];
    return statuses[Math.floor(Math.random() * statuses.length)];
  }

  private getRandomOrdreStatus(): OrdreMarcheStatus {
    const statuses = [
      OrdreMarcheStatus.EN_CARNET,
      OrdreMarcheStatus.EXECUTE,
      OrdreMarcheStatus.ANNULE,
    ];
    return statuses[Math.floor(Math.random() * statuses.length)];
  }

  private getDocumentTypeName(type: DocumentType): string {
    const names = {
      [DocumentType.PHOTO_PROJET]: 'Photos',
      [DocumentType.PERMIS_CONSTRUIRE]: 'Permis',
      [DocumentType.PROSPECTUS]: 'Prospectus',
      [DocumentType.RAPPORT_FINANCIER]: 'Rapport financier',
    };
    return names[type] || 'Document';
  }
}

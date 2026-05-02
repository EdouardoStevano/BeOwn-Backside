import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  UserEntity,
  UserRole,
  UserStatus,
} from 'src/users/infrastructures/persistences/entities/user.entity';
import { UserEmailEntity } from 'src/users/infrastructures/persistences/entities/user-email.entity';
import { SpvEntity } from 'src/projects/infrastructures/persistences/entities/spv.entity';
import { ProjectEntity } from 'src/projects/infrastructures/persistences/entities/project.entity';
import {
  ProjectStatus,
  ProjectType,
  ProjectInstrument,
} from 'src/projects/domains/enums/project-status.enum';
import { WalletEntity } from 'src/wallets/infrastructures/persistences/entities/wallet.entity';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';

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
  ) {}

  async seed(): Promise<void> {
    this.logger.log('Début du seed...');

    const adminEmail = 'admin@beown.com';
    const existingAdmin = await this.emailRepo.findOne({
      where: { email: adminEmail },
    });
    if (existingAdmin) {
      this.logger.log('Seed déjà effectué — données existantes détectées.');
      return;
    }

    const hashedPassword = await bcrypt.hash('BeOwn@Admin2025!', 12);

    // --- Utilisateurs ---
    const usersData = [
      {
        firstname: 'Admin',
        lastname: 'BeOwn',
        email: adminEmail,
        role: UserRole.ADMIN,
      },
      {
        firstname: 'Compliance',
        lastname: 'Officer',
        email: 'compliance@beown.com',
        role: UserRole.COMPLIANCE,
      },
      {
        firstname: 'RCCI',
        lastname: 'BeOwn',
        email: 'rcci@beown.com',
        role: UserRole.RCCI,
      },
      {
        firstname: 'Amadou',
        lastname: 'Diallo',
        email: 'amadou@investisseur.com',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Fatou',
        lastname: 'Sow',
        email: 'fatou@investisseur.com',
        role: UserRole.INVESTISSEUR,
      },
      {
        firstname: 'Moussa',
        lastname: 'Kane',
        email: 'moussa@porteur.com',
        role: UserRole.PORTEUR,
      },
    ];

    const savedUsers: UserEntity[] = [];
    for (const u of usersData) {
      const user = this.userRepo.create({
        firstname: u.firstname,
        lastname: u.lastname,
        password: hashedPassword,
        role: u.role,
        status: UserStatus.ACTIF,
        cguAccepteesLe: new Date(),
      });
      const saved = await this.userRepo.save(user);

      const emailEntity = this.emailRepo.create({
        email: u.email,
        isVerified: true,
        verifiedDate: new Date(),
        user: saved,
      });
      await this.emailRepo.save(emailEntity);

      savedUsers.push(saved);
      this.logger.log(`Utilisateur créé: ${u.email} (${u.role})`);
    }

    const investisseur1 = savedUsers[3];
    const investisseur2 = savedUsers[4];
    const porteur = savedUsers[5];

    // --- Wallets plateforme ---
    const platformWallets = [
      { type: WalletType.FRAIS_PLATEFORME, ref: 'PLAT-FEES-001' },
      { type: WalletType.TAXES, ref: 'PLAT-TAX-001' },
    ];
    for (const w of platformWallets) {
      await this.walletRepo.save(
        this.walletRepo.create({
          type: w.type,
          fournisseurRef: w.ref,
          devise: 'XOF',
          solde: 0,
        }),
      );
    }

    // --- Wallets investisseurs ---
    for (const inv of [investisseur1, investisseur2]) {
      await this.walletRepo.save(
        this.walletRepo.create({
          type: WalletType.INVESTISSEUR,
          proprietaireUserId: inv.userId,
          fournisseurRef: `INV-${inv.userId}-001`,
          devise: 'XOF',
          solde: 5000000,
        }),
      );
    }

    // --- SPV ---
    const spv = await this.spvRepo.save(
      this.spvRepo.create({
        raisonSociale: 'BeOwn Immo SPV 1 SAS',
        siren: '900123456',
        forme: 'SAS',
        capitalSocial: 10000,
        siegeAdresse: 'Dakar, Sénégal',
        iban: 'SN08SN0100150000000001',
      }),
    );
    this.logger.log(`SPV créé: ${spv.raisonSociale}`);

    // --- Projets ---
    const projectsData = [
      {
        slug: 'residence-dakar-plateau',
        titre: 'Résidence Dakar Plateau',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.EN_COLLECTE,
        ville: 'Dakar',
        region: 'Dakar',
        pays: 'SN',
        capitalCible: 50000000,
        capitalMinimum: 30000000,
        ticketMinimum: 50000,
        ticketMaximum: 5000000,
        triCible: 12.5,
        dureeMois: 24,
        instrument: ProjectInstrument.OBLIGATION,
        estPreInvestissable: true,
        plafondPreInvestissement: 20000000,
        descriptionMd: `## Résidence haut standing à Dakar Plateau\n\nInvestissez dans un immeuble résidentiel R+5 situé au cœur du quartier d'affaires de Dakar. Rendement cible de **12,5% par an**.\n\n### Points clés\n- Permis de construire obtenu\n- Promoteur expérimenté (10 ans d'activité)\n- Commercialisation pré-lancée à 40%`,
        avertissementMd: `Investir comporte des risques. Les performances passées ne préjugent pas des performances futures.`,
        porteurId: porteur.userId,
        spvId: spv.id,
        dateOuvertureCollecte: new Date(),
        dateCloturePrevue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
      {
        slug: 'immeuble-commercial-abidjan',
        titre: 'Immeuble Commercial Abidjan Plateau',
        type: ProjectType.TERTIAIRE,
        statut: ProjectStatus.ANNONCE,
        ville: 'Abidjan',
        region: 'Lagunes',
        pays: 'CI',
        capitalCible: 80000000,
        capitalMinimum: 50000000,
        ticketMinimum: 100000,
        ticketMaximum: null,
        triCible: 9.0,
        dureeMois: 36,
        instrument: ProjectInstrument.OBLIGATION_AMORTISSABLE,
        estPreInvestissable: true,
        plafondPreInvestissement: 30000000,
        descriptionMd: `## Immeuble de bureaux prime à Abidjan\n\nAcquisition et rénovation d'un immeuble de bureaux de 2500m² au Plateau (CBD d'Abidjan).`,
        avertissementMd: `Investir comporte des risques.`,
        porteurId: porteur.userId,
        spvId: null,
        dateOuvertureCollecte: null,
        dateCloturePrevue: null,
      },
      {
        slug: 'villa-luxe-bamako',
        titre: 'Villas de Luxe ACI 2000 Bamako',
        type: ProjectType.RESIDENTIEL,
        statut: ProjectStatus.BROUILLON,
        ville: 'Bamako',
        region: 'District de Bamako',
        pays: 'ML',
        capitalCible: 25000000,
        capitalMinimum: 15000000,
        ticketMinimum: 25000,
        ticketMaximum: 2500000,
        triCible: 15.0,
        dureeMois: 18,
        instrument: ProjectInstrument.PART_SOCIALE,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        descriptionMd: `## Projet de villas à Bamako ACI 2000`,
        avertissementMd: `Investir comporte des risques.`,
        porteurId: porteur.userId,
        spvId: null,
        dateOuvertureCollecte: null,
        dateCloturePrevue: null,
      },
    ];

    for (const p of projectsData) {
      const project = await this.projectRepo.save(this.projectRepo.create(p));

      // Wallets techniques par projet pour les projets en collecte/annonce
      if (
        [ProjectStatus.EN_COLLECTE, ProjectStatus.ANNONCE].includes(p.statut)
      ) {
        await this.walletRepo.save(
          this.walletRepo.create({
            type: WalletType.TECHNIQUE_PROJET,
            projetId: project.id,
            fournisseurRef: `TECH-${project.id.slice(0, 8)}`,
            devise: 'XOF',
            solde: 0,
          }),
        );
        if (p.spvId) {
          await this.walletRepo.save(
            this.walletRepo.create({
              type: WalletType.SPV,
              projetId: project.id,
              spvId: p.spvId,
              fournisseurRef: `SPV-${project.id.slice(0, 8)}`,
              devise: 'XOF',
              solde: 0,
            }),
          );
        }
      }

      this.logger.log(`Projet créé: ${p.titre} (${p.statut})`);
    }

    this.logger.log('Seed terminé avec succès.');
  }
}

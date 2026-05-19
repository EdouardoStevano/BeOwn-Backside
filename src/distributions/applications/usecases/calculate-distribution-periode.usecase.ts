import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PeriodeDistribution } from '../../domains/periode-distribution';
import { DistributionPart } from '../../domains/distribution-part';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';
import {
  PERIODE_DISTRIBUTION_REPOSITORY,
  type PeriodeDistributionRepository,
} from '../ports/repositories/periode-distribution.repository';
import {
  DISTRIBUTION_PART_REPOSITORY,
  type DistributionPartRepository,
} from '../ports/repositories/distribution-part.repository';
import {
  LOYER_ENCAISSE_REPOSITORY,
  type LoyerEncaisseRepository,
} from 'src/locative-management/applications/ports/repositories/loyer-encaisse.repository';
import {
  CHARGE_REPOSITORY,
  type ChargeRepository,
} from 'src/locative-management/applications/ports/repositories/charge.repository';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from 'src/projects/applications/ports/repositories/project.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from 'src/investments/applications/ports/repositories/investment.repository';
import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';

const PERIODE_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const TAUX_IR = 0.128;
const TAUX_CSG = 0.172;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CalculateDistributionResult {
  periode: PeriodeDistribution;
  parts: DistributionPart[];
}

/**
 * Calcule la distribution d'une période pour un projet equity-locatif.
 *
 * - Agrège les loyers et charges VALIDES sur la période
 * - Crée une PeriodeDistribution (statut CALCULEE)
 * - Crée une DistributionPart par investisseur CONFIRME, au prorata
 *   de son investissement / capitalCible du projet
 * - Prélève IR 12.8 % + CSG 17.2 % sur le brut (uniquement si brut > 0)
 *
 * Idempotent : si la période existe déjà pour (projet, periode), throw 409.
 */
@Injectable()
export class CalculateDistributionPeriodeUseCase {
  private readonly logger = new Logger(CalculateDistributionPeriodeUseCase.name);

  constructor(
    @Inject(PERIODE_DISTRIBUTION_REPOSITORY)
    private readonly periodeRepo: PeriodeDistributionRepository,
    @Inject(DISTRIBUTION_PART_REPOSITORY)
    private readonly partRepo: DistributionPartRepository,
    @Inject(LOYER_ENCAISSE_REPOSITORY)
    private readonly loyerRepo: LoyerEncaisseRepository,
    @Inject(CHARGE_REPOSITORY)
    private readonly chargeRepo: ChargeRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: ProjectRepository,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepo: InvestmentRepository,
  ) {}

  async execute(
    projetId: string,
    periode: string,
  ): Promise<CalculateDistributionResult> {
    if (!PERIODE_REGEX.test(periode)) {
      throw new BadRequestException(
        'Format période invalide (YYYY-MM attendu).',
      );
    }

    // Idempotency check
    const existing = await this.periodeRepo.findByProjetEtPeriode(
      projetId,
      periode,
    );
    if (existing) {
      throw new ConflictException(
        `Une distribution existe déjà pour le projet ${projetId} sur ${periode} (statut ${existing.statut}).`,
      );
    }

    // Charger le projet et vérifier qu'il est en EQUITY + FINANCE
    const projet = await this.projectRepo.findProjectById(projetId);
    if (!projet) throw new NotFoundException('Projet introuvable.');
    if (projet.modeleEconomique !== ModeleEconomique.EQUITY) {
      throw new BadRequestException(
        `Le projet n'est pas en mode equity (modèle: ${projet.modeleEconomique}).`,
      );
    }
    if (projet.statut !== ProjectStatus.FINANCE) {
      throw new BadRequestException(
        `Le projet n'est pas financé (statut: ${projet.statut}).`,
      );
    }
    if (!projet.capitalCible || projet.capitalCible <= 0) {
      throw new BadRequestException(
        'Le projet n\'a pas de capitalCible valide.',
      );
    }

    // Agréger loyers et charges validés
    const [loyers, charges] = await Promise.all([
      this.loyerRepo.findValidesParProjetEtPeriode(projetId, periode),
      this.chargeRepo.findValidesParProjetEtPeriode(projetId, periode),
    ]);
    const totalLoyers = round2(loyers.reduce((s, l) => s + l.montant, 0));
    const totalCharges = round2(charges.reduce((s, c) => s + c.montant, 0));
    const revenuNet = round2(totalLoyers - totalCharges);

    // Créer la période
    const p = new PeriodeDistribution();
    p.projetId = projetId;
    p.periode = periode;
    p.totalLoyers = totalLoyers;
    p.totalCharges = totalCharges;
    p.revenuNet = revenuNet;
    p.statut = StatutPeriodeDistribution.CALCULEE;
    p.calculeeLe = new Date();
    p.valideeLe = null;
    p.distribueeLe = null;
    const savedPeriode = await this.periodeRepo.save(p);

    // Charger les investissements confirmés du projet
    const investissements = await this.investmentRepo.findByProjetId(projetId);
    const eligibles = investissements.filter(
      (inv) => inv.statut === InvestmentStatus.CONFIRME,
    );

    if (eligibles.length === 0) {
      this.logger.warn(
        `Aucun investissement CONFIRME pour projet ${projetId} — période créée sans parts.`,
      );
      return { periode: savedPeriode, parts: [] };
    }

    const capitalCible = Number(projet.capitalCible);
    const parts: DistributionPart[] = eligibles.map((inv) => {
      const part = new DistributionPart();
      part.periodeDistributionId = savedPeriode.id;
      part.investissementId = inv.id;
      // Pourcentage de détention = montant investi / capital cible (8 décimales)
      const pourcentage = Number(inv.montant) / capitalCible;
      part.pourcentageDetention = Math.round(pourcentage * 1e8) / 1e8;
      part.montantBrut = round2(revenuNet * pourcentage);
      // Fiscalité seulement si revenu positif
      if (part.montantBrut > 0) {
        part.prelevementIR = round2(part.montantBrut * TAUX_IR);
        part.prelevementCSG = round2(part.montantBrut * TAUX_CSG);
      } else {
        part.prelevementIR = 0;
        part.prelevementCSG = 0;
      }
      part.montantNet = round2(
        part.montantBrut - part.prelevementIR - part.prelevementCSG,
      );
      part.payeLe = null;
      return part;
    });

    const savedParts = await this.partRepo.saveAll(parts);
    this.logger.log(
      `Distribution calculée : projet=${projetId} période=${periode} revenuNet=${revenuNet} parts=${savedParts.length}`,
    );
    return { periode: savedPeriode, parts: savedParts };
  }
}

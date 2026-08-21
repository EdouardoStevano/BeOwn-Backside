import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestionnaireAdequationEntity } from '../../infrastructure/persistences/entities/questionnaire-adequation.entity';
import { ProfilPPEntity } from '../../infrastructure/persistences/entities/profil-pp.entity';
import {
  CategorieInvestisseur,
  calculerExpirationEvaluation,
  determinerCategorie,
  evaluerEligibiliteAvertiPersonneMorale,
  evaluerEligibiliteAvertiPersonnePhysique,
  simulerCapaciteDePerte,
} from '../../domains/investor-classification';
import { SaveQuestionnaireDto } from '../../presenters/dto/questionnaire.dto';
import { RiskScoringService } from '../risk-scoring.service';
import { appliquerTestConnaissances } from './save-test-connaissances.usecase';

/**
 * Enregistre l'évaluation de l'investisseur au sens du règlement (UE) 2020/1503.
 *
 * Ce use case n'arbitre rien : il collecte les faits déclarés, délègue toutes
 * les décisions au domaine, puis persiste. Les seuils réglementaires vivent
 * dans `investor-classification.ts` et nulle part ailleurs.
 */
@Injectable()
export class SaveQuestionnaireUseCase {
  private readonly logger = new Logger(SaveQuestionnaireUseCase.name);

  constructor(
    @InjectRepository(QuestionnaireAdequationEntity)
    private readonly questionnaireRepo: Repository<QuestionnaireAdequationEntity>,
    @InjectRepository(ProfilPPEntity)
    private readonly profilPPRepo: Repository<ProfilPPEntity>,
    private readonly riskScoringService: RiskScoringService,
  ) {}

  async execute(
    userId: number,
    dto: SaveQuestionnaireDto,
  ): Promise<QuestionnaireAdequationEntity> {
    // ── Éligibilité au statut d'averti — annexe II ─────────────────────────
    // La partie I (personne morale) prime lorsque les données société sont
    // renseignées ; à défaut on applique la partie II (personne physique).
    const donneesPersonneMorale =
      dto.fondsPropres != null ||
      dto.chiffreAffairesNet != null ||
      dto.totalBilan != null;

    const eligibilite = donneesPersonneMorale
      ? evaluerEligibiliteAvertiPersonneMorale({
          fondsPropres: dto.fondsPropres ?? 0,
          chiffreAffairesNet: dto.chiffreAffairesNet ?? 0,
          totalBilan: dto.totalBilan ?? 0,
        })
      : evaluerEligibiliteAvertiPersonnePhysique({
          revenuBrutAnnuel: dto.revenuBrutAnnuel ?? 0,
          portefeuilleInstrumentsFinanciers: dto.portefeuilleInstrumentsFinanciers ?? 0,
          experienceProfessionnelleFinanciere: dto.experienceProfessionnelleFinanciere,
          transactionsMoyennesParTrimestre: dto.transactionsMoyennesParTrimestre ?? 0,
        });

    // ── Art. 2(1)(j) : l'éligibilité ne suffit pas ────────────────────────
    // Le statut d'averti suppose une demande expresse et l'acceptation de
    // l'avertissement sur la perte de protection. Sans les deux, on reste
    // non averti — c'est le défaut protecteur voulu par le règlement.
    const categorie = determinerCategorie({
      eligible: eligibilite.eligible,
      demandeExpresse: dto.demandeStatutAverti ?? false,
      avertissementAccepte: dto.avertissementStatutAvertiAccepte ?? false,
    });

    // ── Art. 21(5) : simulation de capacité à supporter les pertes ────────
    // Calculée pour tout le monde : elle documente la situation patrimoniale
    // et alimente le seuil d'avertissement de l'art. 21(7).
    const simulation = simulerCapaciteDePerte({
      revenuAnnuel: dto.revenuAnnuel,
      actifsTotaux: dto.actifsTotaux,
      engagementsFinanciers: dto.engagementsFinanciers,
    });

    // ── Art. 21(2) : validité de deux ans ─────────────────────────────────
    const evalueeLe = new Date();
    const expireLe = calculerExpirationEvaluation(evalueeLe);

    let questionnaire = await this.questionnaireRepo.findOne({
      where: { utilisateurId: userId },
    });
    if (!questionnaire) {
      questionnaire = this.questionnaireRepo.create({ utilisateurId: userId });
    }

    // ── Art. 21(1) à 21(4) — test de connaissances (facultatif ici) ───────
    // Appliqué AVANT la sauvegarde, sur la même ligne : un seul écrit, aucune
    // course avec la soumission dédiée. Absent du corps de la requête, rien
    // n'est touché — le parcours historique reste identique.
    const testFourni =
      dto.testConnaissancesScore != null || dto.testConnaissancesTotal != null;
    if (testFourni && (dto.testConnaissancesScore == null || dto.testConnaissancesTotal == null)) {
      throw new BadRequestException(
        'Le test de connaissances exige `testConnaissancesScore` ET `testConnaissancesTotal`.',
      );
    }

    Object.assign(questionnaire, {
      revenuBrutAnnuel: dto.revenuBrutAnnuel ?? null,
      portefeuilleInstrumentsFinanciers: dto.portefeuilleInstrumentsFinanciers ?? null,
      experienceProfessionnelleFinanciere: dto.experienceProfessionnelleFinanciere,
      transactionsMoyennesParTrimestre: dto.transactionsMoyennesParTrimestre ?? 0,
      fondsPropres: dto.fondsPropres ?? null,
      chiffreAffairesNet: dto.chiffreAffairesNet ?? null,
      totalBilan: dto.totalBilan ?? null,
      revenuAnnuel: dto.revenuAnnuel,
      actifsTotaux: dto.actifsTotaux,
      engagementsFinanciers: dto.engagementsFinanciers,
      simulationPerteAcceptee: dto.simulationPerteAcceptee,
      demandeStatutAverti: dto.demandeStatutAverti ?? false,
      avertissementStatutAvertiAccepte: dto.avertissementStatutAvertiAccepte ?? false,
      resultCategorie: categorie,
      criteresRemplis: eligibilite.criteresRemplis,
      patrimoineNetCalcule: simulation.patrimoineNet,
      capaciteDePerteSimulee: simulation.capaciteDePerte,
      seuilAvertissementCalcule: simulation.seuilAvertissement,
      evalueeLe,
      expireLe,
    });

    if (testFourni) {
      appliquerTestConnaissances(questionnaire, {
        score: dto.testConnaissancesScore!,
        total: dto.testConnaissancesTotal!,
        domainesCouverts: dto.testConnaissancesDomaines,
        avertissementInadequationAccepte: dto.avertissementInadequationAccepte,
      });
    } else if (dto.avertissementInadequationAccepte != null) {
      // Accusé de réception envoyé seul : l'investisseur acquitte
      // l'avertissement d'un test déjà passé, sans le repasser.
      questionnaire.avertissementInadequationAccepte =
        dto.avertissementInadequationAccepte;
    }

    const saved = await this.questionnaireRepo.save(questionnaire);

    await this.profilPPRepo.update(
      { utilisateurId: userId },
      {
        categoriePsfp: categorie,
        patrimoineNetCalcule: simulation.patrimoineNet,
        seuilAvertissementCalcule: simulation.seuilAvertissement,
        evaluationExpireLe: expireLe,
      },
    );

    this.logger.log(
      `Évaluation investisseur userId=${userId} categorie=${categorie} ` +
        `criteres=[${eligibilite.criteresRemplis.join(',')}] ` +
        `patrimoineNet=${simulation.patrimoineNet} seuil=${simulation.seuilAvertissement} ` +
        `expireLe=${expireLe.toISOString()}`,
    );

    await this.riskScoringService.computeAndStore(userId);

    return saved;
  }

  /** Expose la catégorie par défaut, pour les appelants qui doivent la refléter. */
  static get categorieParDefaut(): CategorieInvestisseur {
    return CategorieInvestisseur.NON_AVERTI;
  }
}

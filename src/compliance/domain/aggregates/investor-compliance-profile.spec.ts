import {
  KycNiveau,
  KycStatus,
} from 'src/compliance/domain/enums/kyc-status.enum';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { EtapeQuestionnaire } from 'src/compliance/domain/enums/etape-questionnaire.enum';
import { EtapeQuestionnaireFermeeError } from 'src/compliance/domain/errors';
import { PLANCHER_PLAFOND_NON_AVERTI } from 'src/compliance/domain/domain-services/plafond-psfp.domain-service';
import {
  NonAvertiPsfp,
  ProfessionnelPsfp,
} from 'src/compliance/domain/value-objects/classement-psfp.vo';
import { KycMapper } from 'src/compliance/domain/mappers/kyc.mapper';
import { QuestionnaireAdequationFactory } from 'src/compliance/domain/factories/questionnaire-adequation.factory';
import { InvestorComplianceProfile } from './investor-compliance-profile';

const JOUR = 86_400_000;

const dossier = (statut: KycStatus, valideJusquAu: string | null = null) =>
  KycMapper.restore({
    id: 'kyc-1',
    statut,
    motifRefus: null,
    valideJusquAu,
    niveau: KycNiveau.STANDARD,
    fournisseur: 'stripe',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });

const profil = (kycCase = null as ReturnType<typeof dossier> | null) =>
  new InvestorComplianceProfile({ investorId: 42, kycCase, adequacy: null });

describe('InvestorComplianceProfile', () => {
  describe('peutOperer', () => {
    it("refuse un titulaire qui n'a pas ouvert de dossier", () => {
      expect(profil().peutOperer()).toBe(false);
    });

    it('laisse opérer un dossier validé sans échéance', () => {
      expect(profil(dossier(KycStatus.VALIDE)).peutOperer()).toBe(true);
    });

    it('laisse opérer un dossier validé dont la validité court encore', () => {
      const demain = new Date(Date.now() + JOUR).toISOString();
      expect(profil(dossier(KycStatus.VALIDE, demain)).peutOperer()).toBe(true);
    });

    it('refuse un dossier validé dont la validité est périmée', () => {
      // Un dossier validé il y a trois ans ne prouve plus rien : le régulateur
      // attend qu'il soit rejoué.
      const hier = new Date(Date.now() - JOUR).toISOString();
      expect(profil(dossier(KycStatus.VALIDE, hier)).peutOperer()).toBe(false);
    });

    it.each([
      KycStatus.NON_DEMARRE,
      KycStatus.EN_COURS,
      KycStatus.EN_REVUE,
      KycStatus.REFUSE,
      KycStatus.EXPIRE,
      KycStatus.RENOUVELLEMENT,
    ])('refuse le statut %s', (statut) => {
      expect(profil(dossier(statut)).peutOperer()).toBe(false);
    });

    it("s'éprouve à une date donnée, sans dépendre de l'horloge", () => {
      const p = profil(dossier(KycStatus.VALIDE, '2026-06-30'));

      expect(p.peutOperer(new Date('2026-06-29'))).toBe(true);
      expect(p.peutOperer(new Date('2026-07-01'))).toBe(false);
    });
  });

  describe('classement', () => {
    it('classe non averti tant que le questionnaire n’a pas été rempli', () => {
      // Jamais `null` : le classement se gagne, il ne se présume pas, et un
      // repli absent obligerait chaque appelant à le retrouver.
      expect(profil().classement.toSnapshot()).toEqual({
        categoriePsfp: CategoriePsfp.NON_AVERTI,
        patrimoineDeclare: null,
        montantMaxConseille: null,
      });
      expect(profil().estNonAverti()).toBe(true);
    });

    it('reprend la catégorie et le plafond calculés par le questionnaire', () => {
      const p = profil();
      // La racine reçoit les réponses, pas un questionnaire déjà fabriqué :
      // c'est elle qui décide s'il faut en ouvrir un ou remplacer le sien.
      p.repondreAuQuestionnaire({
        patrimoineNet: 400_000,
        understandsTotalLossRisk: true,
        acceptsSimulatedLoss: true,
      });

      expect(p.classement.toSnapshot()).toEqual({
        categoriePsfp: CategoriePsfp.NON_AVERTI,
        patrimoineDeclare: 400_000,
        montantMaxConseille: 20_000,
      });
    });

    it("n'attache ni patrimoine ni plafond à un professionnel", () => {
      // C'est tout l'objet de la hiérarchie : deux catégories sur trois
      // portaient des colonnes structurellement nulles, que rien ne lisait et
      // que rien n'empêchait de remplir.
      const p = profil();
      p.repondreAuQuestionnaire({
        workInFinancialSector: true,
        portfolioOver500k: true,
        patrimoineNet: 800_000,
      });

      expect(p.classement).toBeInstanceOf(ProfessionnelPsfp);
      expect(p.classement.toSnapshot()).toEqual({
        categoriePsfp: CategoriePsfp.PROFESSIONNEL,
        patrimoineDeclare: null,
        montantMaxConseille: null,
      });
      // Le patrimoine déclaré ne lui vaut aucune recommandation : le règlement
      // l'en dispense.
      expect(p.plafondConseille()).toBeNull();
    });

    it('conseille un montant au seul non-averti', () => {
      const p = profil();
      p.repondreAuQuestionnaire({ patrimoineNet: 400_000 });

      expect(p.classement).toBeInstanceOf(NonAvertiPsfp);
      expect(p.plafondConseille()).toBe(20_000);
    });

    it("applique le plancher réglementaire à qui n'a rien déclaré", () => {
      // Le classement initial est un non-averti sans patrimoine : la formule
      // s'applique quand même, et rend le plancher.
      expect(profil().plafondConseille()).toBe(PLANCHER_PLAFOND_NON_AVERTI);
    });
  });

  describe('le questionnaire, étape par étape', () => {
    it('attend la première étape de qui n’a pas encore de questionnaire', () => {
      // Et non `null` : un titulaire sans questionnaire n'a pas « aucune étape
      // à faire », il les a toutes.
      expect(profil().etapeSuivanteDuQuestionnaire()).toBe(
        EtapeQuestionnaire.PRE_QUALIFICATION,
      );
      expect(profil().etapesReponduesDuQuestionnaire()).toEqual([]);
    });

    it('fait naître le questionnaire à la première étape répondue', () => {
      // Rien n'oblige le titulaire à l'ouvrir par un geste séparé.
      const p = profil();

      p.repondreALaPreQualification({ workInFinancialSector: true });

      expect(p.aReponduAuQuestionnaire()).toBe(true);
      expect(p.etapeSuivanteDuQuestionnaire()).toBe(
        EtapeQuestionnaire.QUALIFICATION,
      );
    });

    it('reprend le classement à chaque étape, pas seulement à la dernière', () => {
      const p = profil();

      p.repondreALaPreQualification({
        workInFinancialSector: true,
        portfolioOver500k: true,
      });

      // Le professionnel est classé dès l'étape 1 — le plafond ne le concerne
      // plus, et il n'a aucune étape suivante à passer.
      expect(p.classement.categorie).toBe(CategoriePsfp.PROFESSIONNEL);
      expect(p.etapeSuivanteDuQuestionnaire()).toBeNull();
    });

    it('refuse une étape que le parcours n’a pas ouverte', () => {
      const p = profil();

      expect(() => p.repondreALaQualification({})).toThrow(
        EtapeQuestionnaireFermeeError,
      );
      // Et rien n'a été ouvert au passage : le refus ne laisse pas derrière lui
      // un questionnaire vide qui n'existait pas avant l'appel.
      expect(p.aReponduAuQuestionnaire()).toBe(false);
    });

    it('nomme l’étape attendue dans son refus', () => {
      // « C'est interdit » n'aide personne ; « répondez d'abord à la
      // pré-qualification » se lit à l'écran.
      const p = profil();

      const erreur = (() => {
        try {
          p.repondreALaCapaciteDePerte({});
          return null;
        } catch (e: unknown) {
          return e as EtapeQuestionnaireFermeeError;
        }
      })();

      expect(erreur?.demandee).toBe(EtapeQuestionnaire.CAPACITE_DE_PERTE);
      expect(erreur?.attendue).toBe(EtapeQuestionnaire.PRE_QUALIFICATION);
    });

    it('laisse repasser une étape déjà franchie', () => {
      const p = profil();
      p.repondreALaPreQualification({ workInFinancialSector: true });

      expect(() =>
        p.repondreALaPreQualification({ portfolioOver500k: true }),
      ).not.toThrow();
    });
  });
});

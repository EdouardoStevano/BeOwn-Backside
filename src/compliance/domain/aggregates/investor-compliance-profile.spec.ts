import {
  KycNiveau,
  KycStatus,
} from 'src/compliance/domain/enums/kyc-status.enum';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { KycMapper } from 'src/compliance/domain/mappers/kyc.mapper';
import { QuestionnaireAdequationFactory } from 'src/compliance/domain/factories/questionnaire-adequation.factory';
import { InvestorComplianceProfile } from './investor-compliance-profile';

const JOUR = 86_400_000;

const dossier = (statut: KycStatus, valideJusquAu: string | null = null) =>
  KycMapper.restore({
    id: 'kyc-1',
    utilisateurId: 42,
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
    it("ne classe personne tant que le questionnaire n'a pas été rempli", () => {
      expect(profil().classement).toBeNull();
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

      expect(p.classement).toEqual({
        categoriePsfp: CategoriePsfp.NON_AVERTI,
        patrimoineDeclare: 400_000,
        montantMaxConseille: 20_000,
      });
    });
  });
});

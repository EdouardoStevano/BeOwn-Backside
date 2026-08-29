import {
  KycNiveau,
  KycStatus,
} from 'src/compliance/domain/enums/kyc-status.enum';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { EtapeQuestionnaire } from 'src/compliance/domain/enums/etape-questionnaire.enum';
import {
  EtapeQuestionnaireFermeeError,
  IdentiteDejaVerifieeError,
  KybNeConcernePasUnePersonnePhysiqueError,
  KybPasEnInstructionError,
  PieceIdentiteNeConcernePasUneSocieteError,
} from 'src/compliance/domain/errors';
import { StatutKyb } from 'src/compliance/domain/enums/statut-kyb.enum';
import { TypePieceIdentite } from 'src/compliance/domain/enums/type-piece-identite.enum';
import { FichierDepose } from 'src/compliance/domain/value-objects/fichier-depose.vo';
import { PieceIdentiteDeposee } from 'src/compliance/domain/value-objects/piece-identite-deposee.vo';
import { ProfilInvestisseur } from 'src/compliance/domain/value-objects/profil-investisseur.vo';
import { PLANCHER_PLAFOND_NON_AVERTI } from 'src/compliance/domain/domain-services/plafond-psfp.domain-service';
import {
  NonAvertiPsfp,
  ProfessionnelPsfp,
} from 'src/compliance/domain/value-objects/classement-psfp.vo';
import { KycMapper } from 'src/compliance/domain/mappers/kyc.mapper';
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

/**
 * Le dossier du **même compte**, mais au nom de l'une de ses sociétés.
 *
 * `kycCase` reste paramétrable pour éprouver qu'il n'est jamais lu ici : le
 * repository n'en charge délibérément aucun sur une ligne de société, et
 * `peutOperer` ne doit pas rendre celui du représentant comme s'il était le
 * sien.
 */
const societe = (kycCase = null as ReturnType<typeof dossier> | null) =>
  new InvestorComplianceProfile({
    investorId: 42,
    souscripteur: ProfilInvestisseur.societe('societe-1'),
    kycCase,
    adequacy: null,
  });

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

  describe('le parcours KYB', () => {
    const RCCI = 7;

    describe("l'invariant de nature", () => {
      // Une personne physique prouve son identité, une société son existence
      // légale. Rien n'empêchait jusqu'ici d'écrire un état de société sur la
      // ligne d'un titulaire — ni de lui ouvrir par ce chemin les opérations
      // financières sans qu'aucune identité ait été vérifiée.
      it.each([
        [
          'soumettre à instruction',
          (p: InvestorComplianceProfile) => p.soumettreLeKybALinstruction(),
        ],
        [
          'valider',
          (p: InvestorComplianceProfile) => p.validerLeKyb(null, RCCI),
        ],
        [
          'refuser',
          (p: InvestorComplianceProfile) => p.refuserLeKyb('non', RCCI),
        ],
        [
          'rouvrir',
          (p: InvestorComplianceProfile) => p.rouvrirLeKyb('pièce refusée'),
        ],
      ])('refuse de %s le KYB d’une personne physique', (_, geste) => {
        expect(() => geste(profil())).toThrow(
          KybNeConcernePasUnePersonnePhysiqueError,
        );
      });

      it('ne publie aucun statut KYB pour une personne physique', () => {
        // `null` et non `EN_CONSTITUTION` : un titulaire n'a pas un KYB « à
        // commencer », il n'en a pas du tout.
        expect(profil().statutKyb).toBeNull();
        expect(profil().kybEstEnInstruction()).toBe(false);
      });
    });

    describe('peutOperer', () => {
      it("refuse une société dont le dossier n'a pas été instruit", () => {
        expect(societe().peutOperer()).toBe(false);
        expect(societe().statutKyb).toBe(StatutKyb.EN_CONSTITUTION);
      });

      it('refuse une société dont le dossier attend encore la conformité', () => {
        const s = societe();
        s.soumettreLeKybALinstruction();

        expect(s.kybEstEnInstruction()).toBe(true);
        expect(s.peutOperer()).toBe(false);
      });

      it('laisse opérer une société dont le KYB est validé', () => {
        const s = societe();
        s.soumettreLeKybALinstruction();
        s.validerLeKyb(null, RCCI);

        expect(s.peutOperer()).toBe(true);
      });

      it("s'éprouve à une date donnée, comme la vérification d'identité", () => {
        // Les deux natures de souscripteur doivent expirer selon la même règle,
        // au même instant : le KYB et le KYC ouvrent le même accès.
        const s = societe();
        s.soumettreLeKybALinstruction();
        s.validerLeKyb('2026-06-30', RCCI);

        expect(s.peutOperer(new Date('2026-06-29'))).toBe(true);
        expect(s.peutOperer(new Date('2026-07-01'))).toBe(false);
      });

      it('ne lit pas le KYC du représentant sur la ligne d’une société', () => {
        // Une société n'a pas d'identité à vérifier : son verdict est son KYB,
        // et celui du représentant est composé ailleurs — par
        // `aptitudeDeLaSociete`, qui croise deux racines (§17).
        const s = societe(dossier(KycStatus.VALIDE));

        expect(s.peutOperer()).toBe(false);
      });
    });

    describe('la révocation', () => {
      it('fait retomber en constitution un KYB validé dont une pièce est refusée', () => {
        const s = societe();
        s.soumettreLeKybALinstruction();
        s.validerLeKyb('2099-01-01', RCCI);
        expect(s.peutOperer()).toBe(true);

        s.rouvrirLeKyb('KBIS remplacé');

        expect(s.peutOperer()).toBe(false);
        expect(s.statutKyb).toBe(StatutKyb.EN_CONSTITUTION);
        expect(s.motifRefusKyb).toBe('KBIS remplacé');
      });

      it('refuse de valider un dossier qui vient de retomber en constitution', () => {
        const s = societe();
        s.soumettreLeKybALinstruction();
        s.rouvrirLeKyb('Statuts illisibles');

        expect(() => s.validerLeKyb(null, RCCI)).toThrow(
          KybPasEnInstructionError,
        );
      });
    });

    it('rend la décision au repository même pour une personne physique', () => {
      // La porte `pieces` écrit une ligne de table, pas une vue : rendre `null`
      // ici écrirait la colonne à `NULL` là où `restore` attend un statut.
      expect(profil().pieces.kyb.kybStatut).toBe(StatutKyb.EN_CONSTITUTION);
    });
  });
  describe('le dépôt manuel de la pièce d’identité', () => {
    const identite = () =>
      PieceIdentiteDeposee.deposer({
        type: TypePieceIdentite.PASSEPORT,
        recto: FichierDepose.depose({
          nomOrigine: 'passeport.jpg',
          cleStockage: 'conformite/titulaires/42/passeport',
          url: 'https://exemple/passeport.jpg',
          mimeType: 'image/jpeg',
          tailleOctets: 9_000,
        }),
      });

    it('fait passer le dossier en revue manuelle, du même geste', () => {
      // Le dépôt **est** la demande : un document déposé sans passage en revue
      // attendrait un examen que personne n'a réclamé.
      const p = profil(dossier(KycStatus.REFUSE));

      p.deposerLaPieceIdentitePourRevue(identite());

      expect(p.statutKyc).toBe(KycStatus.EN_REVUE);
      expect(p.pieceIdentitePubliee?.type).toBe(TypePieceIdentite.PASSEPORT);
    });

    it('ouvre un dossier au titulaire qui n’en avait aucun', () => {
      // Parcours abandonné, ou refus d'y passer : lui fermer le recours manuel
      // pour cette raison le laisserait sans aucun chemin vers la vérification.
      const p = profil();
      expect(p.aUnDossierKyc()).toBe(false);

      p.deposerLaPieceIdentitePourRevue(identite());

      expect(p.aUnDossierKyc()).toBe(true);
      expect(p.statutKyc).toBe(KycStatus.EN_REVUE);
    });

    it('remplace le document précédent au lieu d’en accumuler un second', () => {
      const p = profil(dossier(KycStatus.EN_REVUE));
      p.deposerLaPieceIdentitePourRevue(identite());

      p.deposerLaPieceIdentitePourRevue(
        PieceIdentiteDeposee.deposer({
          type: TypePieceIdentite.CARTE_IDENTITE,
          recto: FichierDepose.depose({
            nomOrigine: 'cni-recto.jpg',
            cleStockage: 'conformite/titulaires/42/cni-recto',
            url: 'https://exemple/cni-recto.jpg',
            mimeType: 'image/jpeg',
            tailleOctets: 8_000,
          }),
          verso: FichierDepose.depose({
            nomOrigine: 'cni-verso.jpg',
            cleStockage: 'conformite/titulaires/42/cni-verso',
            url: 'https://exemple/cni-verso.jpg',
            mimeType: 'image/jpeg',
            tailleOctets: 8_000,
          }),
        }),
      );

      expect(p.pieceIdentitePubliee?.type).toBe(
        TypePieceIdentite.CARTE_IDENTITE,
      );
    });

    it('refuse le dépôt sur une identité déjà vérifiée', () => {
      // Le dépôt manuel est un recours, pas un second chemin : sur un dossier
      // que le fournisseur a validé, il rouvrirait une question tranchée.
      const p = profil(dossier(KycStatus.VALIDE));

      expect(() => p.deposerLaPieceIdentitePourRevue(identite())).toThrow(
        IdentiteDejaVerifieeError,
      );
    });

    it('laisse redéposer sur une validation périmée', () => {
      // Sa validité ne prouve plus rien : c'est `peutOperer` qui fait la
      // différence, pas le seul statut.
      const hier = new Date(Date.now() - JOUR).toISOString();
      const p = profil(dossier(KycStatus.VALIDE, hier));

      expect(() => p.deposerLaPieceIdentitePourRevue(identite())).not.toThrow();
    });

    it('refuse le dépôt sur le dossier d’une société', () => {
      // Une société n'a pas d'identité à vérifier — c'est le pendant exact de
      // l'invariant KYB, et les deux ferment la question dans les deux sens.
      expect(() =>
        societe().deposerLaPieceIdentitePourRevue(identite()),
      ).toThrow(PieceIdentiteNeConcernePasUneSocieteError);
    });
  });
});

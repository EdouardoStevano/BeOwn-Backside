import {
  KycNiveau,
  KycStatus,
} from 'src/onboarding/domain/enums/kyc-status.enum';
import {
  IdentiteDejaVerifieeError,
  KybNeConcernePasUnePersonnePhysiqueError,
  KybPasEnInstructionError,
  PieceIdentiteNeConcernePasUneSocieteError,
} from 'src/onboarding/domain/errors';
import { StatutKyb } from 'src/onboarding/domain/enums/statut-kyb.enum';
import { TypePieceIdentite } from 'src/onboarding/domain/enums/type-piece-identite.enum';
import { FichierDepose } from 'src/onboarding/domain/value-objects/fichier-depose.vo';
import { PieceIdentiteDeposee } from 'src/onboarding/domain/value-objects/piece-identite-deposee.vo';
import { ProfilInvestisseur } from 'src/onboarding/domain/value-objects/profil-investisseur.vo';
import { KycMapper } from 'src/onboarding/domain/mappers/kyc.mapper';
import { DossierDEntreeEnRelation } from './dossier-d-entree-en-relation';

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
  new DossierDEntreeEnRelation({ investorId: 42, kycCase });

/**
 * Le dossier du **même compte**, mais au nom de l'une de ses sociétés.
 *
 * `kycCase` reste paramétrable pour éprouver qu'il n'est jamais lu ici : le
 * repository n'en charge délibérément aucun sur une ligne de société, et
 * `peutOperer` ne doit pas rendre celui du représentant comme s'il était le
 * sien.
 */
const societe = (kycCase = null as ReturnType<typeof dossier> | null) =>
  new DossierDEntreeEnRelation({
    investorId: 42,
    souscripteur: ProfilInvestisseur.societe('societe-1'),
    kycCase,
  });

describe('DossierDEntreeEnRelation', () => {
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
          (p: DossierDEntreeEnRelation) => p.soumettreLeKybALinstruction(),
        ],
        [
          'valider',
          (p: DossierDEntreeEnRelation) => p.validerLeKyb(null, RCCI),
        ],
        [
          'refuser',
          (p: DossierDEntreeEnRelation) => p.refuserLeKyb('non', RCCI),
        ],
        [
          'rouvrir',
          (p: DossierDEntreeEnRelation) => p.rouvrirLeKyb('pièce refusée'),
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

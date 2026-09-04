import {
  DUREES_RETENTION,
  FinalitePurge,
  MAX_LOTS_PAR_RUN,
  RegimeAnonymisation,
  SortDocument,
  TAILLE_LOT_PURGE,
  dateEcheance,
  emailAnonymise,
  estEchu,
  regimeAnonymisation,
  seuilPurge,
  sortDocumentUtilisateur,
} from 'src/rgpd/domains/retention-policy';
import { DocumentType } from 'src/documents/domains/enums/document-type.enum';

/**
 * Barème de conservation testé PUR — aucune base, aucun réseau, uniquement des
 * dates en mémoire. Les valeurs attendues sont celles du document de
 * conformité (docs/conformite/2026-09-03-baremes-lot2.md, dépôt Frontside) :
 * si un test casse ici, c'est que le code a divergé du barème validé.
 */
describe('retention-policy (domaine pur)', () => {
  describe('durées du barème (verrouillées sur le document de conformité)', () => {
    it('compte jamais activé : 30 jours', () => {
      expect(DUREES_RETENTION[FinalitePurge.COMPTE_JAMAIS_ACTIVE]).toEqual({
        jours: 30,
      });
    });

    it('prospect inactif : 3 ans', () => {
      expect(DUREES_RETENTION[FinalitePurge.PROSPECT_INACTIF]).toEqual({
        annees: 3,
      });
    });

    it('KYC post-clôture : 5 ans (L. 561-12 CMF)', () => {
      expect(
        DUREES_RETENTION[FinalitePurge.KYC_ECHEANCE_POST_CLOTURE],
      ).toEqual({ annees: 5 });
    });

    it('notifications : 12 mois', () => {
      expect(DUREES_RETENTION[FinalitePurge.NOTIFICATIONS]).toEqual({
        mois: 12,
      });
    });

    it("journaux d'audit : 5 ans", () => {
      expect(DUREES_RETENTION[FinalitePurge.JOURNAUX_AUDIT]).toEqual({
        annees: 5,
      });
    });

    it('filet compte supprimé non anonymisé : immédiat (0 jour)', () => {
      expect(
        DUREES_RETENTION[FinalitePurge.COMPTE_SUPPRIME_A_ANONYMISER],
      ).toEqual({ jours: 0 });
    });
  });

  describe('dateEcheance / estEchu — arithmétique calendaire', () => {
    const depart = new Date('2026-01-15T10:00:00.000Z');

    it('30 jours après le 15 janvier = 14 février', () => {
      expect(
        dateEcheance(FinalitePurge.COMPTE_JAMAIS_ACTIVE, depart).toISOString(),
      ).toBe('2026-02-14T10:00:00.000Z');
    });

    it('5 ans après 2026 = 2031 (année civile, pas 365 × 5 jours)', () => {
      expect(
        dateEcheance(
          FinalitePurge.KYC_ECHEANCE_POST_CLOTURE,
          depart,
        ).toISOString(),
      ).toBe('2031-01-15T10:00:00.000Z');
    });

    it("12 mois traversent l'année : 15 janvier 2026 → 15 janvier 2027", () => {
      expect(
        dateEcheance(FinalitePurge.NOTIFICATIONS, depart).toISOString(),
      ).toBe('2027-01-15T10:00:00.000Z');
    });

    it("estEchu est strict : à l'échéance exacte, pas encore échu", () => {
      const echeance = dateEcheance(FinalitePurge.NOTIFICATIONS, depart);
      expect(estEchu(FinalitePurge.NOTIFICATIONS, depart, echeance)).toBe(
        false,
      );
      expect(
        estEchu(
          FinalitePurge.NOTIFICATIONS,
          depart,
          new Date(echeance.getTime() + 1),
        ),
      ).toBe(true);
    });

    it('non échu avant la durée', () => {
      expect(
        estEchu(
          FinalitePurge.PROSPECT_INACTIF,
          depart,
          new Date('2028-12-31T00:00:00.000Z'),
        ),
      ).toBe(false);
    });
  });

  describe('seuilPurge — inverse exact de dateEcheance', () => {
    it.each(Object.values(FinalitePurge))(
      'pour %s : un point de départ antérieur au seuil est échu, postérieur ne l’est pas',
      (finalite) => {
        const maintenant = new Date('2026-09-03T12:00:00.000Z');
        const seuil = seuilPurge(finalite, maintenant);
        const avantSeuil = new Date(seuil.getTime() - 1000);
        const apresSeuil = new Date(seuil.getTime() + 1000);
        expect(estEchu(finalite, avantSeuil, maintenant)).toBe(true);
        expect(estEchu(finalite, apresSeuil, maintenant)).toBe(false);
      },
    );

    it('seuil des notifications : 12 mois en arrière', () => {
      expect(
        seuilPurge(
          FinalitePurge.NOTIFICATIONS,
          new Date('2026-09-03T12:00:00.000Z'),
        ).toISOString(),
      ).toBe('2025-09-03T12:00:00.000Z');
    });
  });

  describe("régime d'anonymisation (§2.1 / §2.2)", () => {
    it('aucune obligation → purge totale', () => {
      expect(
        regimeAnonymisation({
          kycEngage: false,
          aTransactions: false,
          aInvestissements: false,
        }),
      ).toBe(RegimeAnonymisation.PURGE_TOTALE);
    });

    it.each([
      [{ kycEngage: true, aTransactions: false, aInvestissements: false }],
      [{ kycEngage: false, aTransactions: true, aInvestissements: false }],
      [{ kycEngage: false, aTransactions: false, aInvestissements: true }],
    ])(
      'la moindre obligation (%o) → archivage restreint',
      (obligations: any) => {
        expect(regimeAnonymisation(obligations)).toBe(
          RegimeAnonymisation.ARCHIVAGE_RESTREINT,
        );
      },
    );
  });

  describe('emailAnonymise', () => {
    it('format imposé, unicité par userId, TLD non résoluble', () => {
      expect(emailAnonymise(42)).toBe('supprime-42@anonymise.invalid');
      expect(emailAnonymise(43)).not.toBe(emailAnonymise(42));
    });
  });

  describe('sortDocumentUtilisateur (§2.3)', () => {
    it.each([
      DocumentType.IDENTITE,
      DocumentType.SELFIE,
      DocumentType.JUSTIFICATIF_DOMICILE,
      DocumentType.JUSTIFICATIF_REVENU,
    ])('pièce KYC %s → archivage conservation légale, JAMAIS détruite', (t) => {
      expect(sortDocumentUtilisateur(t)).toBe(
        SortDocument.ARCHIVER_CONSERVATION_LEGALE,
      );
    });

    it.each([
      DocumentType.CONTRAT_SOUSCRIPTION,
      DocumentType.BULLETIN_SOUSCRIPTION,
      DocumentType.CONTRAT_RACHAT,
      DocumentType.CONTRAT_RAJOUT,
      DocumentType.CERTIFICAT_ACCEPTATION,
      DocumentType.IFU_ANNUEL,
      DocumentType.FICI,
      DocumentType.DIS,
    ])('pièce contractuelle/fiscale %s → conservée intacte', (t) => {
      expect(sortDocumentUtilisateur(t)).toBe(SortDocument.CONSERVER);
    });

    it('pièce sans obligation (AUTRE) → suppression immédiate', () => {
      expect(sortDocumentUtilisateur(DocumentType.AUTRE)).toBe(
        SortDocument.SUPPRIMER,
      );
    });

    it('type inconnu du barème → conservé par défaut (jamais détruit par omission)', () => {
      expect(sortDocumentUtilisateur('TYPE_FUTUR' as DocumentType)).toBe(
        SortDocument.CONSERVER,
      );
    });
  });

  describe('bornes de lot', () => {
    it('lots bornés et plafond par run définis', () => {
      expect(TAILLE_LOT_PURGE).toBeGreaterThan(0);
      expect(MAX_LOTS_PAR_RUN).toBeGreaterThan(0);
    });
  });
});

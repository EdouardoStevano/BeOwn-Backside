import { KycNiveau, KycStatus } from 'src/kyc/domains/enums/kyc-status.enum';
import { ChampKycInvalideError } from 'src/kyc/domains/errors';
import {
  FOURNISSEUR_PAR_DEFAUT,
  KycFactory,
} from 'src/kyc/domains/factories/kyc.factory';

describe('KycFactory.creer', () => {
  it('ouvre un dossier vierge rattaché au compte', () => {
    const kyc = KycFactory.creer({ utilisateurId: 42 });

    expect(kyc.utilisateurId).toBe(42);
    expect(kyc.statut).toBe(KycStatus.NON_DEMARRE);
    expect(kyc.niveau).toBe(KycNiveau.STANDARD);
    expect(kyc.fournisseur).toBe(FOURNISSEUR_PAR_DEFAUT);
    expect(kyc.scoreRisque).toBeNull();
    expect(kyc.fournisseurRef).toBeNull();
    expect(kyc.valideJusquAu).toBeNull();
    expect(kyc.motifRefus).toBeNull();
    expect(kyc.stripeReportId).toBeNull();
    expect(kyc.identiteExtrait).toBeNull();
  });

  it("n'ouvre pas de dossier déjà validé", () => {
    // L'enjeu n'est pas cosmétique : `KycValidatedGuard` n'autorise dépôts,
    // investissements et retraits que sur `statut === VALIDE`. Un statut
    // déclarable à l'ouverture suffirait à s'affranchir de toute vérification
    // d'identité — la fabrique ne l'expose donc pas, et une clé glissée dans
    // les props n'y change rien.
    const kyc = KycFactory.creer({
      utilisateurId: 42,
      statut: KycStatus.VALIDE,
    } as unknown as { utilisateurId: number });

    expect(kyc.statut).toBe(KycStatus.NON_DEMARRE);
  });

  it('accepte un niveau de diligence renforcé', () => {
    const kyc = KycFactory.creer({
      utilisateurId: 42,
      niveau: KycNiveau.RENFORCE,
    });

    expect(kyc.niveau).toBe(KycNiveau.RENFORCE);
  });

  it.each([[0], [-1], [1.5], [NaN]])(
    'refuse un identifiant utilisateur invalide (%p)',
    (utilisateurId) => {
      expect(() => KycFactory.creer({ utilisateurId })).toThrow(
        ChampKycInvalideError,
      );
    },
  );

  it('refuse un fournisseur vide', () => {
    // La colonne est NOT NULL : une chaîne blanche passerait, et le dossier ne
    // serait plus rattachable à un prestataire — donc impossible à relancer.
    expect(() =>
      KycFactory.creer({ utilisateurId: 42, fournisseur: '   ' }),
    ).toThrow(ChampKycInvalideError);
  });

  it("laisse la persistance attribuer l'identité de la ligne", () => {
    const kyc = KycFactory.creer({ utilisateurId: 42 });

    expect(kyc.id).toBeUndefined();
    expect(kyc.createdAt).toBeUndefined();
    expect(kyc.updatedAt).toBeUndefined();
  });
});

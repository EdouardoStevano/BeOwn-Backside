import {
  KycNiveau,
  KycStatus,
} from 'src/compliance/domain/enums/kyc-status.enum';
import { ChampKycInvalideError } from 'src/compliance/domain/errors';
import {
  FOURNISSEUR_PAR_DEFAUT,
  KycFactory,
} from 'src/compliance/domain/factories/kyc.factory';

describe('KycFactory.creer', () => {
  it('ouvre un dossier vierge', () => {
    // Il ne porte pas le titulaire : c'est la racine qui le connaît (§6).
    const kyc = KycFactory.creer();

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
      statut: KycStatus.VALIDE,
    } as unknown as Record<string, never>);

    expect(kyc.statut).toBe(KycStatus.NON_DEMARRE);
  });

  it('accepte un niveau de diligence renforcé', () => {
    const kyc = KycFactory.creer({
      niveau: KycNiveau.RENFORCE,
    });

    expect(kyc.niveau).toBe(KycNiveau.RENFORCE);
  });

  // Le test « refuse un identifiant utilisateur invalide » a disparu avec la
  // clé qu'il éprouvait : le dossier ne porte plus le titulaire, c'est la
  // racine qui le connaît — et c'est la clé étrangère de `investor_compliance_profile`
  // vers `users` qui garantit qu'il existe.

  it('refuse un fournisseur vide', () => {
    // La colonne est NOT NULL : une chaîne blanche passerait, et le dossier ne
    // serait plus rattachable à un prestataire — donc impossible à relancer.
    expect(() => KycFactory.creer({ fournisseur: '   ' })).toThrow(
      ChampKycInvalideError,
    );
  });

  it("laisse la persistance attribuer l'identité de la ligne", () => {
    const kyc = KycFactory.creer();

    expect(kyc.id).toBeUndefined();
    expect(kyc.createdAt).toBeUndefined();
    expect(kyc.updatedAt).toBeUndefined();
  });
});

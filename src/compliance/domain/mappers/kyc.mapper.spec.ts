import {
  KycNiveau,
  KycStatus,
} from 'src/compliance/domain/enums/kyc-status.enum';
import { KycFactory } from 'src/compliance/domain/factories/kyc.factory';
import { KycMapper } from 'src/compliance/domain/mappers/kyc.mapper';

const LIGNE = {
  id: 'kyc-1',
  statut: KycStatus.VALIDE,
  niveau: KycNiveau.STANDARD,
  scoreRisque: 12,
  fournisseur: 'stripeIdentity',
  fournisseurRef: 'vs_1',
  valideJusquAu: '2027-05-01',
  motifRefus: null,
  stripeReportId: 'vr_1',
  identiteExtrait: { nom: 'Dupont', prenom: 'Marie' },
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-02T10:00:00.000Z'),
};

describe('KycMapper', () => {
  it('rend un JSON dont les clés sont celles publiées avant le découpage', () => {
    // Le front lit ce contrat sur trois routes (`kyc/me`, `kyc/all`,
    // `/users/me`) : un agrégat à champs privés qui ressortirait avec ses
    // `_decision` et `_fournisseurRef` le casserait sans bruit.
    const kyc = KycMapper.restore(LIGNE);

    expect(kyc.toJSON()).toEqual(LIGNE);
  });

  it('reconstitue sans rejouer la moindre règle', () => {
    // Une ligne écrite avant qu'une borne n'existe doit rester lisible, ne
    // serait-ce que pour corriger la donnée fautive.
    const kyc = KycMapper.restore({ ...LIGNE, fournisseur: '' });

    expect(kyc.fournisseur).toBe('');
  });

  it('ramène une échéance de validité à sa date civile', () => {
    // La colonne est de type `date` : le driver rend une chaîne, un import
    // pourrait rendre un `Date`. Les deux désignent le même jour, et c'est ce
    // jour — sans heure ni fuseau — que le front reçoit.
    const depuisDate = KycMapper.restore({
      ...LIGNE,
      valideJusquAu: new Date('2027-05-01T00:00:00.000Z'),
    });

    expect(depuisDate.valideJusquAu).toBe('2027-05-01');
  });

  it("tolère les colonnes qu'un save() ne relit pas", () => {
    // TypeORM rend l'entité qu'on lui a passée : les colonnes que l'agrégat
    // n'écrit pas (rapport de vérification, identité extraite) en sont absentes.
    const kyc = KycMapper.restore({
      id: 'kyc-1',
      statut: KycStatus.NON_DEMARRE,
      niveau: KycNiveau.STANDARD,
      fournisseur: 'stripeIdentity',
      createdAt: LIGNE.createdAt,
      updatedAt: LIGNE.updatedAt,
    });

    expect(kyc.scoreRisque).toBeNull();
    expect(kyc.fournisseurRef).toBeNull();
    expect(kyc.stripeReportId).toBeNull();
    expect(kyc.identiteExtrait).toBeNull();
    expect(kyc.motifRefus).toBeNull();
    expect(kyc.valideJusquAu).toBeNull();
  });

  it('ne porte jamais le titulaire du dossier', () => {
    // Le dossier ne publie que ce dont il est propriétaire. Le titulaire
    // appartient à IAM : il est composé par-dessus, dans
    // `GetKycUseCase.executeAll`, à partir du seul `utilisateurId`. Le jour où
    // cette clé réapparaîtrait ici, c'est qu'une jointure vers `users` serait
    // revenue dans le contexte Profiles.
    const kyc = KycMapper.restore(LIGNE);

    expect('utilisateur' in kyc.toJSON()).toBe(false);
  });

  it("ne partage pas le jsonb rendu par l'ORM", () => {
    // Un agrégat qui garde la référence de l'objet de l'entité n'est immuable
    // qu'en apparence : muter la ligne mute le dossier.
    const identiteExtrait = { nom: 'Dupont' };
    const kyc = KycMapper.restore({ ...LIGNE, identiteExtrait });

    identiteExtrait.nom = 'Autre';

    expect(kyc.identiteExtrait?.nom).toBe('Dupont');
  });

  it("traduit un dossier qui vient de naître, avant que la base ne l'identifie", () => {
    const snapshot = KycMapper.toSnapshot(KycFactory.creer());

    expect(snapshot.id).toBeUndefined();
    expect(snapshot.statut).toBe(KycStatus.NON_DEMARRE);
  });
});

import { ProfilPMMapper } from './profil-pm.mapper';
import { ProfilPMSnapshotBrut } from 'src/onboarding/domain/aggregates/profil-pm';
import { ProfilPMFactory } from 'src/onboarding/domain/factories/profil-pm.factory';

/**
 * Une ligne délibérément fautive au regard des règles actuelles : SIREN de
 * trois chiffres, greffe sans immatriculation complète, forme juridique en
 * minuscules. C'est le cas qui compte — ces lignes existent en base, écrites
 * avant que les règles n'existent.
 */
const LIGNE: ProfilPMSnapshotBrut = {
  id: 'c4e8b1a6-9d70-4f23-8a51-6b2e0f7c9d34',
  userId: 42,
  raisonSociale: 'X',
  formeJuridique: 'sas',
  siren: '123',
  rcsVille: 'Paris',
  capitalSocial: '50000.00',
  siegeAdresse: '12 rue de la Paix',
  representantId: null,
  secteurActivite: 'Immobilier',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
};

describe('ProfilPMMapper.restore', () => {
  it('relit une ligne écrite avant que les règles existent', () => {
    // Refuser au chargement rendrait le profil inaccessible — y compris pour
    // corriger le SIREN fautif.
    const profil = ProfilPMMapper.restore(LIGNE);

    expect(profil.identiteLegale.siren).toBe('123');
    expect(profil.identiteLegale.formeJuridique).toBe('sas');
    expect(profil.identiteLegale.rcsVille).toBe('Paris');
  });

  it('convertit le décimal que Postgres rend en chaîne', () => {
    // Sans cela le domaine exposerait « 50000.00 » entre guillemets, là où son
    // type annonce un nombre.
    expect(ProfilPMMapper.restore(LIGNE).capitalSocial).toBe(50_000);
  });

  it('traite un décimal illisible comme non renseigné, jamais comme NaN', () => {
    const profil = ProfilPMMapper.restore({
      ...LIGNE,
      capitalSocial: 'illisible',
    });

    expect(profil.capitalSocial).toBeNull();
  });
});

describe('ProfilPMMapper.toSnapshot', () => {
  it("rend la ligne telle qu'elle est entrée", () => {
    // L'aller-retour ligne → domaine → ligne ne doit rien perdre : c'est ce
    // que fait le repository à chaque sauvegarde.
    const snapshot = ProfilPMMapper.toSnapshot(ProfilPMMapper.restore(LIGNE));

    expect(snapshot).toEqual({
      ...LIGNE,
      // Seule forme normalisée : le décimal rendu en chaîne par le driver.
      capitalSocial: 50_000,
    });
  });

  it('assemble à plat ce que le bloc a regroupé', () => {
    const profil = ProfilPMFactory.creer({
      userId: 42,
      raisonSociale: 'BeOwn',
      formeJuridique: 'sas',
      siren: '404833048',
      capitalSocial: 50_000,
    });

    const snapshot = ProfilPMMapper.toSnapshot(profil);

    // La forme de la table est reconstituée sans que la persistance ait à
    // connaître `IdentiteLegale`.
    expect(snapshot.userId).toBe(42);
    expect(snapshot.raisonSociale).toBe('BeOwn');
    expect(snapshot.formeJuridique).toBe('SAS');
    expect(snapshot.siren).toBe('404833048');
    expect(snapshot.capitalSocial).toBe(50_000);
  });
});

describe('ProfilPM.toJSON', () => {
  it('publie exactement les clés attendues par le front, et rien de privé', () => {
    const json = JSON.parse(
      JSON.stringify(ProfilPMMapper.restore(LIGNE)),
    ) as Record<string, unknown>;

    expect(Object.keys(json).sort()).toEqual(
      [
        'capitalSocial',
        'id',
        'createdAt',
        'formeJuridique',
        'raisonSociale',
        'rcsVille',
        'representantId',
        'secteurActivite',
        'siegeAdresse',
        'siren',
        'updatedAt',
        'userId',
      ].sort(),
    );
    // Le découpage en bloc ne doit pas fuir dans la réponse HTTP.
    expect(json.identiteLegale).toBeUndefined();
    expect(Object.keys(json).some((cle) => cle.startsWith('_'))).toBe(false);
  });
});

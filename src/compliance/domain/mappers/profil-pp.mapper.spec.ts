import { ProfilPPMapper } from './profil-pp.mapper';
import { ProfilPPSnapshotBrut } from 'src/compliance/domain/aggregates/profil-pp';
import { ProfilPPFactory } from 'src/compliance/domain/factories/profil-pp.factory';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';

/**
 * Une ligne délibérément fautive au regard des règles actuelles : code pays
 * inexistant, date d'un mineur, code postal belge sous pays français, NIF sans
 * juridiction, téléphone trop court. C'est le cas qui compte — ces lignes
 * existent en base, écrites avant que les règles n'existent.
 */
const LIGNE: ProfilPPSnapshotBrut = {
  utilisateurId: 42,
  civilite: 'Monsieur',
  nomNaissance: null,
  paysNaissance: null,
  dateNaissance: '2015-01-01',
  lieuNaissance: null,
  nationalite: 'ZZ',
  telephone: '06',
  adresseLigne1: null,
  adresseLigne2: null,
  codePostal: '1000',
  ville: null,
  pays: 'FR',
  profession: null,
  secteurActivite: null,
  pep: false,
  residenceFiscale: null,
  nif: 'X',
  categoriePsfp: CategoriePsfp.AVERTI,
  patrimoineDeclare: '500000.00',
  montantMaxConseille: null,
  niveauRisque: 'modere',
  dernierContactAdmin: null,
  prochainContactDu: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
};

describe('ProfilPPMapper.restore', () => {
  it('relit une ligne écrite avant que les règles existent', () => {
    // Refuser au chargement rendrait le profil inaccessible — y compris pour
    // corriger la donnée fautive.
    const profil = ProfilPPMapper.restore(LIGNE);

    expect(profil.identite.nationalite).toBe('ZZ');
    expect(profil.identite.dateNaissance).toBe('2015-01-01');
    expect(profil.situationFiscale.nif).toBe('X');
    expect(profil.categoriePsfp).toBe(CategoriePsfp.AVERTI);
  });

  it('absorbe les formes que rend le driver Postgres', () => {
    const profil = ProfilPPMapper.restore({
      ...LIGNE,
      // Colonne `date` rendue en `Date`, colonne `decimal` rendue en chaîne.
      dateNaissance: new Date('1985-06-15T00:00:00.000Z'),
      patrimoineDeclare: '500000.00',
    });

    expect(profil.identite.dateNaissance).toBe('1985-06-15');
    expect(profil.patrimoineDeclare).toBe(500_000);
  });
});

describe('ProfilPPMapper.toSnapshot', () => {
  it("rend la ligne telle qu'elle est entrée", () => {
    // L'aller-retour ligne → domaine → ligne ne doit rien perdre : c'est ce
    // que fait le repository à chaque sauvegarde.
    const snapshot = ProfilPPMapper.toSnapshot(ProfilPPMapper.restore(LIGNE));

    expect(snapshot).toEqual({
      ...LIGNE,
      // Seule forme normalisée : le décimal rendu en chaîne par le driver.
      patrimoineDeclare: 500_000,
    });
  });

  it('assemble à plat ce que le découpage en blocs a séparé', () => {
    const profil = ProfilPPFactory.creer({
      utilisateurId: 42,
      nationalite: 'FR',
      ville: 'Paris',
      profession: 'Ingénieur',
      residenceFiscale: 'FR',
      nif: '1234567890',
    });

    const snapshot = ProfilPPMapper.toSnapshot(profil);

    // Un champ de chaque bloc, plus l'en-tête : la forme de la table est
    // reconstituée sans que la persistance ait à connaître les blocs.
    expect(snapshot.utilisateurId).toBe(42);
    expect(snapshot.nationalite).toBe('FR');
    expect(snapshot.ville).toBe('Paris');
    expect(snapshot.profession).toBe('Ingénieur');
    expect(snapshot.nif).toBe('1234567890');
    expect(snapshot.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
  });
});

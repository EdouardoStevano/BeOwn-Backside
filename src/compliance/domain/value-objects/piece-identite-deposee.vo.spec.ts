import { TypePieceIdentite } from 'src/compliance/domain/enums/type-piece-identite.enum';
import { VersoDeLaPieceIdentiteIncoherentError } from 'src/compliance/domain/errors';
import { FichierDepose } from './fichier-depose.vo';
import { PieceIdentiteDeposee } from './piece-identite-deposee.vo';

const LE_JOUR = new Date('2026-08-28T10:00:00.000Z');

const fichier = (nom = 'cni-recto.jpg') =>
  FichierDepose.depose({
    nomOrigine: nom,
    cleStockage: `conformite/titulaires/42/${nom}`,
    url: `https://exemple/${nom}`,
    mimeType: 'image/jpeg',
    tailleOctets: 9_000,
  });

const deposer = (type: TypePieceIdentite, verso: FichierDepose | null = null) =>
  PieceIdentiteDeposee.deposer({
    type,
    recto: fichier(),
    verso,
    maintenant: LE_JOUR,
  });

describe('PieceIdentiteDeposee', () => {
  describe('la règle du verso', () => {
    it('exige le dos de la seule carte nationale d’identité', () => {
      // La date d'expiration et la bande MRZ y sont : accepter le seul recto
      // reviendrait à valider une identité sans pouvoir dire si la pièce est
      // encore valide.
      const carte = TypePieceIdentite.CARTE_IDENTITE;

      expect(() => deposer(carte)).toThrow(
        VersoDeLaPieceIdentiteIncoherentError,
      );
      expect(deposer(carte, fichier('cni-verso.jpg')).verso).not.toBeNull();
    });

    it.each([
      TypePieceIdentite.PASSEPORT,
      TypePieceIdentite.PERMIS_CONDUIRE,
      TypePieceIdentite.TITRE_SEJOUR,
    ])('accepte un %s en une seule page, et refuse son dos', (type) => {
      // Les trois se prouvent d'une seule face : leur réclamer un verso
      // n'ajouterait aucune garantie et les rendrait plus durs à déposer.
      expect(deposer(type).verso).toBeNull();

      expect(() => deposer(type, fichier('page-2.jpg'))).toThrow(
        VersoDeLaPieceIdentiteIncoherentError,
      );
    });

    it('dit lequel des deux sens a été pris', () => {
      // « Document invalide » n'aide personne : le titulaire doit savoir s'il
      // lui manque une face ou s'il en a envoyé une de trop.
      const manquant = (() => {
        try {
          deposer(TypePieceIdentite.CARTE_IDENTITE);
          return null;
        } catch (e: unknown) {
          return e as VersoDeLaPieceIdentiteIncoherentError;
        }
      })();

      expect(manquant?.attendu).toBe(true);
      expect(manquant?.message).toContain('recto et verso');
    });
  });

  describe('toSnapshot', () => {
    it('range le document en objets imbriqués, prêt pour le `jsonb`', () => {
      const piece = deposer(
        TypePieceIdentite.CARTE_IDENTITE,
        fichier('cni-verso.jpg'),
      );

      const range = piece.toSnapshot();

      expect(range.type).toBe(TypePieceIdentite.CARTE_IDENTITE);
      expect(range.deposeeLe).toBe(LE_JOUR.toISOString());
      // Deux objets, et non dix clés préfixées comme sur les justificatifs de
      // société : rien ici ne se filtre, donc rien n'a besoin d'être à plat.
      expect(range.recto).toEqual(fichier('cni-recto.jpg').toSnapshot());
      expect(range.verso).toEqual(fichier('cni-verso.jpg').toSnapshot());
    });

    it('fait l’aller-retour sans rien perdre', () => {
      const piece = deposer(TypePieceIdentite.PASSEPORT);

      const relue = PieceIdentiteDeposee.restore(piece.toSnapshot());

      expect(relue.type).toBe(TypePieceIdentite.PASSEPORT);
      expect(relue.verso).toBeNull();
      expect(relue.deposeeLe).toEqual(LE_JOUR);
      expect(relue.recto.cleStockage).toBe(piece.recto.cleStockage);
    });
  });
});

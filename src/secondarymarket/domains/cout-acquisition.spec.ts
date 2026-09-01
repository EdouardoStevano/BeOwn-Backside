import { computeCoutAcquisition } from './cout-acquisition';

/**
 * Coût d'acquisition — base de la plus-value du vendeur, donc des frais sur
 * gain qui lui sont réellement prélevés. Une erreur ici ne se voit nulle part
 * dans l'interface : elle se traduit seulement par des frais faux.
 *
 * Domaine pur : aucune base, aucun réseau, aucune horloge.
 */
describe('computeCoutAcquisition', () => {
  describe('achat primaire simple', () => {
    it('applique le prix de souscription aux fractions vendues', () => {
      // 10 fractions souscrites à 100 € : céder 3 coûte 300 € d'acquisition.
      const cout = computeCoutAcquisition(
        { montant: 1000, nbTitres: 10, valeurTitre: 100 },
        3,
        150,
      );
      expect(cout).toBe(300);
    });

    it('ignore le prix de vente quand le coût réel est connu', () => {
      // Même position, prix de vente très différent : le coût ne bouge pas.
      const base = { montant: 1000, nbTitres: 10, valeurTitre: 100 };
      expect(computeCoutAcquisition(base, 3, 500)).toBe(300);
      expect(computeCoutAcquisition(base, 3, 10)).toBe(300);
    });

    it('accepte les décimaux stockés en chaîne par le pilote SQL', () => {
      const cout = computeCoutAcquisition(
        { montant: '1000.00' as unknown as number, nbTitres: 10, valeurTitre: null },
        2,
        150,
      );
      expect(cout).toBe(200);
    });
  });

  describe('achats fusionnés — moyenne pondérée', () => {
    it('pondère deux lots acquis à des prix différents', () => {
      // 10 × 100 € puis 5 × 140 € → 1 700 € pour 15 fractions,
      // soit 113,3333…/fraction. Céder 3 → 340,00 € arrondi au centime.
      const cout = computeCoutAcquisition(
        { montant: 1700, nbTitres: 15, valeurTitre: 100 },
        3,
        160,
      );
      expect(cout).toBe(340);
    });

    it('le coût moyen prime sur valeurTitre, qui ne porte que le premier lot', () => {
      // `valeurTitre` reste à 100 après une fusion à 140 : s'en servir
      // sous-estimerait le coût et gonflerait la plus-value facturée.
      const cout = computeCoutAcquisition(
        { montant: 1700, nbTitres: 15, valeurTitre: 100 },
        15,
        160,
      );
      expect(cout).toBe(1700);
      expect(cout).not.toBe(1500);
    });
  });

  describe('replis quand le coût moyen est inexploitable', () => {
    it('nbTitres nul : repli sur valeurTitre', () => {
      expect(
        computeCoutAcquisition({ montant: 1000, nbTitres: null, valeurTitre: 90 }, 4, 150),
      ).toBe(360);
    });

    it('nbTitres à zéro : repli sur valeurTitre (aucune division par zéro)', () => {
      expect(
        computeCoutAcquisition({ montant: 1000, nbTitres: 0, valeurTitre: 90 }, 4, 150),
      ).toBe(360);
    });

    it('montant nul : repli sur valeurTitre', () => {
      expect(
        computeCoutAcquisition({ montant: null, nbTitres: 10, valeurTitre: 90 }, 4, 150),
      ).toBe(360);
    });

    it('aucun repère : le coût vaut le prix de vente → plus-value nulle, aucun frais sur gain', () => {
      // On ne facture jamais un gain qu'on ne sait pas mesurer.
      const prixVente = 150;
      const nbVendues = 4;
      const cout = computeCoutAcquisition(
        { montant: null, nbTitres: null, valeurTitre: null },
        nbVendues,
        prixVente,
      );
      expect(cout).toBe(600);
      expect(cout).toBe(prixVente * nbVendues); // plus-value = 0
    });
  });

  describe('vente partielle antérieure — le coût moyen ne dérive pas', () => {
    /**
     * Reproduit l'étape 5 du règlement telle qu'elle est CORRIGÉE : la position
     * du vendeur est décrémentée du coût d'acquisition des parts cédées, pas de
     * leur prix de vente.
     */
    const cederPartiellement = (
      position: { montant: number; nbTitres: number; valeurTitre: number | null },
      nbVendues: number,
      prixVente: number,
    ) => {
      const cout = computeCoutAcquisition(position, nbVendues, prixVente);
      return {
        cout,
        position: {
          montant: Math.max(0, Math.round((position.montant - cout) * 100) / 100),
          nbTitres: position.nbTitres - nbVendues,
          valeurTitre: position.valeurTitre,
        },
      };
    };

    it('après une cession en PLUS-VALUE, la vente suivante garde le même coût unitaire', () => {
      const initiale = { montant: 1000, nbTitres: 10, valeurTitre: 100 };

      const premiere = cederPartiellement(initiale, 4, 150);
      expect(premiere.cout).toBe(400);
      expect(premiere.position).toMatchObject({ montant: 600, nbTitres: 6 });

      // Coût unitaire résiduel = 600 / 6 = 100 → inchangé.
      const seconde = cederPartiellement(premiere.position, 3, 150);
      expect(seconde.cout).toBe(300);
    });

    it('après une cession en MOINS-VALUE, le coût unitaire ne remonte pas non plus', () => {
      const initiale = { montant: 1000, nbTitres: 10, valeurTitre: 100 };

      const premiere = cederPartiellement(initiale, 4, 60);
      expect(premiere.cout).toBe(400);
      expect(premiere.position).toMatchObject({ montant: 600, nbTitres: 6 });

      const seconde = cederPartiellement(premiere.position, 6, 60);
      expect(seconde.cout).toBe(600);
      expect(seconde.position.montant).toBe(0);
    });

    it('décrémenter du PRIX DE VENTE aurait faussé la cession suivante — contre-exemple', () => {
      // Ancien comportement : montant -= prix de vente (600) au lieu du coût
      // d'acquisition (400). Le coût unitaire résiduel tombait à 400/6 ≈ 66,67
      // et la plus-value de la cession suivante était surévaluée de 50 %.
      const apresAncienComportement = { montant: 400, nbTitres: 6, valeurTitre: 100 };
      const coutFausse = computeCoutAcquisition(apresAncienComportement, 3, 150);
      expect(coutFausse).toBe(200);

      const apresComportementCorrige = { montant: 600, nbTitres: 6, valeurTitre: 100 };
      expect(computeCoutAcquisition(apresComportementCorrige, 3, 150)).toBe(300);
    });

    it('le montant résiduel est planché à zéro, jamais négatif', () => {
      const initiale = { montant: 100, nbTitres: 1, valeurTitre: 100 };
      const cession = cederPartiellement(initiale, 1, 20);
      expect(cession.position.montant).toBe(0);
    });
  });
});

import {
  calculerEtatFinancierProjet,
  etatFinancierVide,
} from './etat-financier-projet';

/**
 * L'état financier est une projection PURE des agrégats du grand livre :
 * il se teste sans base de données. C'est le contrat consommé par l'écran
 * financier du back-office (lot 7b).
 */
describe('État financier projet (domaine pur)', () => {
  const PROJET = 'p1';

  it('collecte financée sans frais ni versement : tout est dû au porteur', () => {
    const etat = calculerEtatFinancierProjet(PROJET, {
      devise: 'EUR',
      credite: 50000,
      rembourse: 0,
      autresDecaissements: 0,
      fraisRetenus: 0,
      dejaVerse: 0,
      enDelaiReflexion: 0,
      soldeWalletProjet: 50000,
    });

    expect(etat).toMatchObject({
      projetId: PROJET,
      devise: 'EUR',
      collecte: 50000,
      fraisRetenus: 0,
      netAVerser: 50000,
      dejaVerse: 0,
      restantDu: 50000,
      ecartReconciliation: 0,
      coherent: true,
    });
  });

  it('déduit les remboursements de la collecte acquise', () => {
    const etat = calculerEtatFinancierProjet(PROJET, {
      devise: 'EUR',
      credite: 50000,
      rembourse: 12000,
      autresDecaissements: 0,
      fraisRetenus: 0,
      dejaVerse: 0,
      enDelaiReflexion: 0,
      soldeWalletProjet: 38000,
    });

    expect(etat.collecte).toBe(38000);
    expect(etat.netAVerser).toBe(38000);
    expect(etat.coherent).toBe(true);
  });

  it('versement partiel constaté : le restant dû décroît d’autant', () => {
    const etat = calculerEtatFinancierProjet(PROJET, {
      devise: 'EUR',
      credite: 50000,
      rembourse: 0,
      autresDecaissements: 0,
      fraisRetenus: 500,
      dejaVerse: 20000,
      enDelaiReflexion: 0,
      soldeWalletProjet: 29500,
    });

    expect(etat.netAVerser).toBe(49500);
    expect(etat.dejaVerse).toBe(20000);
    expect(etat.restantDu).toBe(29500);
    expect(etat.ecartReconciliation).toBe(0);
    expect(etat.coherent).toBe(true);
  });

  it('les fonds encore sous délai de réflexion ne sont PAS comptés dans la collecte acquise', () => {
    const etat = calculerEtatFinancierProjet(PROJET, {
      devise: 'EUR',
      credite: 30000,
      rembourse: 0,
      autresDecaissements: 0,
      fraisRetenus: 0,
      dejaVerse: 0,
      enDelaiReflexion: 8000,
      soldeWalletProjet: 30000,
    });

    // 8 000 € sont engagés mais encore rétractables : ils restent chez leurs
    // investisseurs et ne peuvent pas être versés au porteur.
    expect(etat.collecte).toBe(30000);
    expect(etat.enDelaiReflexion).toBe(8000);
    expect(etat.netAVerser).toBe(30000);
    expect(etat.coherent).toBe(true);
  });

  it('cas réel du seed : capital et intérêts déjà servis réduisent le dû au porteur', () => {
    // Mesuré sur « Résidence Les Jardins — Dakar » : 600 000 € crédités,
    // 45 € de frais et 4 455 € déjà servis aux investisseurs (capital et
    // intérêts). Sans la catégorie « autres décaissements », le net à verser
    // était surestimé de 4 455 € et le grand livre paraissait incohérent.
    const etat = calculerEtatFinancierProjet(PROJET, {
      devise: 'EUR',
      credite: 600000,
      rembourse: 0,
      autresDecaissements: 4455,
      fraisRetenus: 45,
      dejaVerse: 0,
      enDelaiReflexion: 0,
      soldeWalletProjet: 595500,
    });

    expect(etat.collecte).toBe(600000);
    expect(etat.netAVerser).toBe(595500);
    expect(etat.restantDu).toBe(595500);
    expect(etat.ecartReconciliation).toBe(0);
    expect(etat.coherent).toBe(true);
  });

  it('signale un grand livre désaligné plutôt que de le masquer', () => {
    const etat = calculerEtatFinancierProjet(PROJET, {
      devise: 'EUR',
      credite: 50000,
      rembourse: 0,
      autresDecaissements: 0,
      fraisRetenus: 0,
      dejaVerse: 0,
      // Le solde réel du wallet ne correspond pas aux écritures : anomalie.
      soldeWalletProjet: 41000,
      enDelaiReflexion: 0,
    });

    expect(etat.restantDu).toBe(50000);
    expect(etat.ecartReconciliation).toBe(-9000);
    expect(etat.coherent).toBe(false);
  });

  it('arrondit au centime sans laisser filer de dérive flottante', () => {
    const etat = calculerEtatFinancierProjet(PROJET, {
      devise: 'EUR',
      credite: 0.1 + 0.2, // 0.30000000000000004
      rembourse: 0,
      autresDecaissements: 0,
      fraisRetenus: 0,
      dejaVerse: 0,
      enDelaiReflexion: 0,
      soldeWalletProjet: 0.3,
    });

    expect(etat.collecte).toBe(0.3);
    expect(etat.coherent).toBe(true);
  });

  it('projet sans aucun mouvement : état neutre et cohérent', () => {
    const etat = etatFinancierVide(PROJET);

    expect(etat).toMatchObject({
      projetId: PROJET,
      devise: 'EUR',
      collecte: 0,
      enDelaiReflexion: 0,
      fraisRetenus: 0,
      netAVerser: 0,
      dejaVerse: 0,
      restantDu: 0,
      soldeWalletProjet: 0,
      coherent: true,
    });
  });
});

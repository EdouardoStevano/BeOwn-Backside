/**
 * Vérifie que la mécanique d'écritures du seed produit un grand livre que
 * `rapprocherGrandLivre` (le contrôle de la réconciliation nocturne) rapproche
 * à 0 écart — sans base de données ni réseau.
 *
 * Chaque test rejoue une forme d'écriture réellement utilisée par
 * `seed.service.ts` (dépôt, souscription, escrow, distribution avec IR/CSG et
 * frais, retrait en vol, remboursement de collecte, cession secondaire) et
 * vérifie l'invariant. Le dernier test prouve que le contrôle DÉTECTE bien une
 * écriture mal orientée : un garde-fou qui ne peut pas échouer ne garde rien.
 */
import { LivreSeed } from './seed-ledger';
import { TransactionStatus } from 'src/wallets/domains/enums/wallet.enum';

const REUSSI = TransactionStatus.REUSSI;

describe('LivreSeed — invariant comptable du jeu de données seedé', () => {
  it('rapproche un dépôt externe (contrepartie carte, source null)', () => {
    const livre = new LivreSeed();
    livre.enregistrer({ source: null, destination: 'inv1', montant: 1000, statut: REUSSI });

    expect(livre.solde('inv1')).toBe(1000);
    expect(livre.ecarts()).toEqual([]);
  });

  it('rapproche une souscription interne investisseur → wallet projet', () => {
    const livre = new LivreSeed();
    livre.enregistrer({ source: null, destination: 'inv1', montant: 1000, statut: REUSSI });
    livre.enregistrer({ source: 'inv1', destination: 'projet', montant: 600, statut: REUSSI });

    expect(livre.solde('inv1')).toBe(400);
    expect(livre.solde('projet')).toBe(600);
    expect(livre.ecarts()).toEqual([]);
  });

  it('conserve les fonds détenus sur un blocage puis une libération d’escrow', () => {
    const livre = new LivreSeed();
    livre.enregistrer({ source: null, destination: 'inv2', montant: 500, statut: REUSSI });
    // ESCROW_LOCK : disponible → bloqué, intra-wallet (source = destination).
    livre.enregistrer({
      source: 'inv2',
      destination: 'inv2',
      montant: 200,
      statut: REUSSI,
      effet: 'blocage',
    });
    expect(livre.solde('inv2')).toBe(300);
    expect(livre.soldeBloque('inv2')).toBe(200);
    expect(livre.ecarts()).toEqual([]);

    // ESCROW_RELEASE : la poche bloquée est acquise au projet.
    livre.enregistrer({
      source: 'inv2',
      destination: 'projet',
      montant: 200,
      statut: REUSSI,
      effet: 'liberation',
    });
    expect(livre.soldeBloque('inv2')).toBe(0);
    expect(livre.solde('projet')).toBe(200);
    expect(livre.ecarts()).toEqual([]);
  });

  it('compte un retrait EN_COURS (déjà débité) mais ignore une écriture ECHOUE', () => {
    const livre = new LivreSeed();
    livre.enregistrer({ source: null, destination: 'inv3', montant: 900, statut: REUSSI });
    // Retrait en vol : le wallet est débité dès la demande.
    livre.enregistrer({
      source: 'inv3',
      destination: null,
      montant: 300,
      statut: TransactionStatus.EN_COURS,
    });
    // Dépôt refusé par le PSP : ligne d'historique, aucun solde touché.
    livre.enregistrer({
      source: null,
      destination: 'inv3',
      montant: 5000,
      statut: TransactionStatus.ECHOUE,
    });

    expect(livre.solde('inv3')).toBe(600);
    expect(livre.ecarts()).toEqual([]);
  });

  it('rapproche une distribution complète : frais + net + IR + CSG sortent du projet', () => {
    const livre = new LivreSeed();
    // Le projet a été alimenté (apport porteur) à hauteur du loyer.
    livre.enregistrer({ source: null, destination: 'projet', montant: 4500, statut: REUSSI });

    // Même forme que ExecuteDistributionUseCase, rejouée par le seed :
    livre.enregistrer({ source: 'projet', destination: 'frais', montant: 815, statut: REUSSI });
    livre.enregistrer({ source: 'projet', destination: 'inv1', montant: 1289.75, statut: REUSSI });
    livre.enregistrer({ source: 'projet', destination: 'ir', montant: 235.84, statut: REUSSI });
    livre.enregistrer({ source: 'projet', destination: 'csg', montant: 316.91, statut: REUSSI });
    livre.enregistrer({ source: 'projet', destination: 'inv2', montant: 773.85, statut: REUSSI });
    livre.enregistrer({ source: 'projet', destination: 'ir', montant: 141.5, statut: REUSSI });
    livre.enregistrer({ source: 'projet', destination: 'csg', montant: 190.15, statut: REUSSI });
    livre.enregistrer({ source: 'projet', destination: 'inv3', montant: 515.9, statut: REUSSI });
    livre.enregistrer({ source: 'projet', destination: 'ir', montant: 94.34, statut: REUSSI });
    livre.enregistrer({ source: 'projet', destination: 'csg', montant: 126.76, statut: REUSSI });

    // 4 500 = 815 (frais) + 3 685 (brut réparti net + IR + CSG).
    expect(livre.solde('projet')).toBe(0);
    expect(livre.solde('ir')).toBe(471.68);
    expect(livre.solde('csg')).toBe(633.82);
    expect(livre.ecarts()).toEqual([]);
  });

  it('rapproche un remboursement de collecte échouée (aller-retour neutre)', () => {
    const livre = new LivreSeed();
    livre.enregistrer({ source: null, destination: 'inv2', montant: 10000, statut: REUSSI });
    livre.enregistrer({ source: 'inv2', destination: 'projetF', montant: 10000, statut: REUSSI });
    livre.enregistrer({ source: 'projetF', destination: 'inv2', montant: 10000, statut: REUSSI });

    expect(livre.solde('projetF')).toBe(0);
    expect(livre.solde('inv2')).toBe(10000);
    expect(livre.ecarts()).toEqual([]);
  });

  it('rapproche une cession secondaire réglée (acheteur → vendeur, frais vendeur → plateforme)', () => {
    const livre = new LivreSeed();
    livre.enregistrer({ source: null, destination: 'acheteur', montant: 12000, statut: REUSSI });
    // Prix de cession payé par l'acheteur au vendeur.
    livre.enregistrer({ source: 'acheteur', destination: 'vendeur', montant: 11000, statut: REUSSI });
    // Frais vendeur (transaction + plus-value) prélevés sur le produit de la vente.
    livre.enregistrer({ source: 'vendeur', destination: 'frais', montant: 110, statut: REUSSI });
    livre.enregistrer({ source: 'vendeur', destination: 'frais', montant: 150, statut: REUSSI });

    expect(livre.solde('acheteur')).toBe(1000);
    expect(livre.solde('vendeur')).toBe(10740);
    expect(livre.solde('frais')).toBe(260);
    expect(livre.ecarts()).toEqual([]);
  });

  it('détecte une écriture mal orientée (le garde-fou sait échouer)', () => {
    const livre = new LivreSeed();
    livre.enregistrer({ source: null, destination: 'inv1', montant: 1000, statut: REUSSI });

    // Positions falsifiées : le dépôt aurait été inscrit côté débiteur.
    const positionsFautives = new Map([
      ['inv1', { solde: -1000, soldeBloque: 0 }],
    ]);
    const ecarts = livre.ecartsContre(positionsFautives);
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0].walletId).toBe('inv1');
    expect(ecarts[0].ecart).toBe(-2000);
  });

  it('refuse un blocage qui ne serait pas intra-wallet', () => {
    const livre = new LivreSeed();
    expect(() =>
      livre.enregistrer({
        source: 'inv1',
        destination: 'projet',
        montant: 100,
        statut: REUSSI,
        effet: 'blocage',
      }),
    ).toThrow(/intra-wallet/);
  });
});

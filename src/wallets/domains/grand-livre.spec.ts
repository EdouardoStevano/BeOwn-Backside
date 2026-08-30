import {
  EcritureGrandLivre,
  PositionWallet,
  TOLERANCE_INVARIANT_EUR,
  fondsDetenus,
  grandLivreEquilibre,
  grandLivreRapproche,
  mouvementsDepuisInstantanes,
  positionsDepuisEcritures,
  rapprocherGrandLivre,
  variationFondsDetenus,
  variationTotale,
} from './grand-livre';

/**
 * Le cœur de l'invariant est une fonction pure : il se teste sans base de
 * données ni réseau. Si ces règles sont fausses, aucun test d'intégration ne
 * peut rattraper le grand livre.
 */
describe('Grand livre — invariant comptable (domaine pur)', () => {
  describe('fondsDetenus', () => {
    it('additionne disponible et bloqué', () => {
      expect(fondsDetenus({ solde: 700, soldeBloque: 300 })).toBe(1000);
    });

    it('tolère les decimal PostgreSQL renvoyés en chaîne', () => {
      expect(fondsDetenus({ solde: '700.50', soldeBloque: '299.50' })).toBe(1000);
    });

    it('traite une poche bloquée absente ou nulle comme zéro', () => {
      expect(fondsDetenus({ solde: 500 })).toBe(500);
      expect(fondsDetenus({ solde: 500, soldeBloque: null })).toBe(500);
    });
  });

  describe('variationFondsDetenus', () => {
    it('un blocage d’escrow ne fait rien varier : disponible → bloqué', () => {
      expect(
        variationFondsDetenus({ walletId: 'w1', deltaSolde: -200, deltaBloque: 200 }),
      ).toBe(0);
    });

    it('un débit sec fait varier de son montant', () => {
      expect(variationFondsDetenus({ walletId: 'w1', deltaSolde: -200 })).toBe(-200);
    });
  });

  describe('grandLivreEquilibre', () => {
    it('un transfert entre deux wallets est équilibré', () => {
      const mouvements = [
        { walletId: 'investisseur', deltaSolde: -200 },
        { walletId: 'projet', deltaSolde: 200 },
      ];
      expect(variationTotale(mouvements)).toBe(0);
      expect(grandLivreEquilibre(mouvements)).toBe(true);
    });

    it('un débit sans contrepartie est DÉSÉQUILIBRÉ — le défaut que ce lot corrige', () => {
      // C'est exactement l'état antérieur : walletDestination = null, l'argent
      // quittait l'investisseur sans être crédité à personne.
      const mouvements = [{ walletId: 'investisseur', deltaSolde: -200 }];
      expect(grandLivreEquilibre(mouvements)).toBe(false);
      expect(variationTotale(mouvements)).toBe(-200);
    });

    it('absorbe une dérive d’arrondi sous le dixième de centime, pas au-delà', () => {
      const sousTolerance = [
        { walletId: 'a', deltaSolde: -100 },
        { walletId: 'b', deltaSolde: 100 + TOLERANCE_INVARIANT_EUR / 2 },
      ];
      const auDela = [
        { walletId: 'a', deltaSolde: -100 },
        { walletId: 'b', deltaSolde: 100.01 },
      ];
      expect(grandLivreEquilibre(sousTolerance)).toBe(true);
      expect(grandLivreEquilibre(auDela)).toBe(false);
    });

    it('un mouvement à trois jambes (frais prélevés) reste équilibré', () => {
      const mouvements = [
        { walletId: 'investisseur', deltaSolde: -1000 },
        { walletId: 'projet', deltaSolde: 930 },
        { walletId: 'frais-plateforme', deltaSolde: 70 },
      ];
      expect(grandLivreEquilibre(mouvements)).toBe(true);
    });
  });

  describe('mouvementsDepuisInstantanes', () => {
    const instantane = (
      entrees: [string, PositionWallet][],
    ): Map<string, PositionWallet> => new Map(entrees);

    it('dérive les deltas de chaque wallet entre deux instantanés', () => {
      const avant = instantane([
        ['w1', { solde: 1000, soldeBloque: 0 }],
        ['wp1', { solde: 0, soldeBloque: 0 }],
      ]);
      const apres = instantane([
        ['w1', { solde: 800, soldeBloque: 0 }],
        ['wp1', { solde: 200, soldeBloque: 0 }],
      ]);

      const mouvements = mouvementsDepuisInstantanes(avant, apres);

      expect(mouvements).toEqual(
        expect.arrayContaining([
          { walletId: 'w1', deltaSolde: -200, deltaBloque: 0 },
          { walletId: 'wp1', deltaSolde: 200, deltaBloque: 0 },
        ]),
      );
      expect(variationTotale(mouvements)).toBe(0);
    });

    it('ignore les wallets inchangés', () => {
      const etat = instantane([
        ['w1', { solde: 1000, soldeBloque: 0 }],
        ['w2', { solde: 50, soldeBloque: 0 }],
      ]);
      expect(mouvementsDepuisInstantanes(etat, etat)).toHaveLength(0);
    });

    it('un wallet créé à solde nul n’est pas un mouvement ; son alimentation en est un', () => {
      const avant = instantane([['w1', { solde: 300 }]]);
      const creationSeule = instantane([
        ['w1', { solde: 300 }],
        ['wp1', { solde: 0 }],
      ]);
      const puisAlimente = instantane([
        ['w1', { solde: 0 }],
        ['wp1', { solde: 300 }],
      ]);

      expect(mouvementsDepuisInstantanes(avant, creationSeule)).toHaveLength(0);
      expect(variationTotale(mouvementsDepuisInstantanes(avant, puisAlimente))).toBe(0);
    });

    it('capte le déblocage d’escrow comme un mouvement interne nul', () => {
      const avant = instantane([['w1', { solde: 700, soldeBloque: 300 }]]);
      const apres = instantane([['w1', { solde: 1000, soldeBloque: 0 }]]);

      const mouvements = mouvementsDepuisInstantanes(avant, apres);

      expect(mouvements).toEqual([
        { walletId: 'w1', deltaSolde: 300, deltaBloque: -300 },
      ]);
      expect(variationTotale(mouvements)).toBe(0);
    });
  });
});

/**
 * Rapprochement « Σ crédits − Σ débits = solde », le contrôle qui manquait.
 *
 * ANO-02 : un dépôt inscrit du mauvais côté laisse le solde JUSTE et le
 * registre FAUX. Aucun test ne vérifiait ce rapprochement — il est ici posé
 * comme fonction pure du domaine, réutilisable par les tests de parcours.
 */
describe('Grand livre — rapprochement registre / positions réelles', () => {
  const positions = (
    entrees: [string, PositionWallet][],
  ): ReadonlyMap<string, PositionWallet> => new Map(entrees);

  describe('positionsDepuisEcritures', () => {
    it('un dépôt crédite le bénéficiaire : contrepartie externe côté source', () => {
      const ecritures: EcritureGrandLivre[] = [
        { walletSource: null, walletDestination: 'w1', montant: 50 },
      ];
      expect(positionsDepuisEcritures(ecritures).get('w1')).toBe(50);
    });

    it('un retrait débite le titulaire : contrepartie externe côté destination', () => {
      const ecritures: EcritureGrandLivre[] = [
        { walletSource: 'w1', walletDestination: null, montant: 50 },
      ];
      expect(positionsDepuisEcritures(ecritures).get('w1')).toBe(-50);
    });

    it('un mouvement intra-wallet se compense de lui-même', () => {
      const ecritures: EcritureGrandLivre[] = [
        { walletSource: 'w1', walletDestination: 'w1', montant: 1000 },
      ];
      expect(positionsDepuisEcritures(ecritures).get('w1')).toBe(0);
    });

    it('tolère les decimal PostgreSQL renvoyés en chaîne', () => {
      const ecritures: EcritureGrandLivre[] = [
        { walletDestination: 'w1', montant: '310000.00' },
        { walletSource: 'w1', walletDestination: 'wp1', montant: '1000.00' },
      ];
      const registre = positionsDepuisEcritures(ecritures);
      expect(registre.get('w1')).toBe(309000);
      expect(registre.get('wp1')).toBe(1000);
    });
  });

  describe('rapprocherGrandLivre', () => {
    it('parcours complet dépôt → souscription → frais : aucun écart', () => {
      const ecritures: EcritureGrandLivre[] = [
        { walletDestination: 'w-inv', montant: 10000 }, // dépôt par carte
        { walletSource: 'w-inv', walletDestination: 'w-inv', montant: 1000 }, // escrow_lock
        { walletSource: 'w-inv', walletDestination: 'wp1', montant: 1000 }, // souscription
        { walletSource: 'wp1', walletDestination: 'w-frais', montant: 70 }, // frais
      ];
      const reelles = positions([
        ['w-inv', { solde: 9000, soldeBloque: 0 }],
        ['wp1', { solde: 930 }],
        ['w-frais', { solde: 70 }],
      ]);

      expect(rapprocherGrandLivre(reelles, ecritures)).toEqual([]);
      expect(grandLivreRapproche(reelles, ecritures)).toBe(true);
    });

    it('compte le bloqué : un escrow en cours ne crée pas d’écart', () => {
      const ecritures: EcritureGrandLivre[] = [
        { walletDestination: 'w-inv', montant: 10000 },
      ];
      const reelles = positions([
        ['w-inv', { solde: 9000, soldeBloque: 1000 }],
      ]);

      expect(rapprocherGrandLivre(reelles, ecritures)).toEqual([]);
    });

    it('ANO-02 — un dépôt inscrit CÔTÉ SOURCE : solde juste, registre à l’envers', () => {
      // Écriture telle que la produisait payment.controller avant correction :
      // l'identifiant du bénéficiaire posé du côté débiteur.
      const fautif: EcritureGrandLivre[] = [
        { walletSource: 'w-inv', walletDestination: null, montant: 150 },
      ];
      const reelles = positions([['w-inv', { solde: 150, soldeBloque: 0 }]]);

      const ecarts = rapprocherGrandLivre(reelles, fautif);

      expect(grandLivreRapproche(reelles, fautif)).toBe(false);
      expect(ecarts).toEqual([
        { walletId: 'w-inv', fondsDetenus: 150, grandLivre: -150, ecart: 300 },
      ]);
    });

    it('une écriture manquante se voit : le solde dépasse le registre', () => {
      const ecritures: EcritureGrandLivre[] = [
        { walletDestination: 'w-inv', montant: 100 },
      ];
      const reelles = positions([['w-inv', { solde: 250 }]]);

      expect(rapprocherGrandLivre(reelles, ecritures)).toEqual([
        { walletId: 'w-inv', fondsDetenus: 250, grandLivre: 100, ecart: 150 },
      ]);
    });

    it('un wallet absent d’un des deux côtés est traité comme position nulle', () => {
      const ecritures: EcritureGrandLivre[] = [
        { walletDestination: 'w-inconnu', montant: 40 },
      ];

      expect(rapprocherGrandLivre(new Map(), ecritures)).toEqual([
        { walletId: 'w-inconnu', fondsDetenus: 0, grandLivre: 40, ecart: -40 },
      ]);
    });

    it('reste dans la tolérance d’arrondi, sans l’élargir', () => {
      const ecritures: EcritureGrandLivre[] = [
        { walletDestination: 'w1', montant: 100 },
      ];

      expect(
        rapprocherGrandLivre(
          positions([['w1', { solde: 100 + TOLERANCE_INVARIANT_EUR / 2 }]]),
          ecritures,
        ),
      ).toEqual([]);
      expect(
        rapprocherGrandLivre(positions([['w1', { solde: 100.01 }]]), ecritures),
      ).toHaveLength(1);
    });
  });
});

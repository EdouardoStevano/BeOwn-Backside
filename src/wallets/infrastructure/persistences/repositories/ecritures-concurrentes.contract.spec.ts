/**
 * Suite de CONTRAT des écritures monétaires concurrentes.
 *
 * Écrite une fois, exécutable contre n'importe quelle implémentation du
 * magasin — en mémoire aujourd'hui, PostgreSQL le jour où un harnais de base
 * jetable existera. C'est ce qui donne un sens vérifiable aux garanties que la
 * passe 2/3 a introduites : les écritures d'argent ne sont plus « lire,
 * calculer, réécrire » mais « UPDATE relatif conditionnel dont on vérifie
 * `affected` ».
 *
 * CE QU'ELLE ÉPROUVE — les quatre invariants sur lesquels reposent le
 * règlement d'une cession (`FinalizeSignedContractUseCase`) et son annulation
 * (`AdminSecondaryMarketController`) :
 *
 *  1. un débit conditionnel ne passe JAMAIS sous la couverture demandée ;
 *  2. deux débits concurrents du même montant ne réussissent pas tous les deux
 *     quand un seul est couvert ;
 *  3. une position de titres ne peut pas être vendue deux fois ;
 *  4. une transition d'état conditionnelle est single-shot.
 *
 * LIMITE ASSUMÉE, à dire clairement : elle n'est aujourd'hui jouée QUE contre
 * l'implémentation en mémoire ci-dessous. Le dépôt ne dispose d'AUCUN harnais
 * de base jetable — ni testcontainers, ni base de test — vérifié au moment
 * d'écrire ce fichier. En mémoire, la « concurrence » est SÉQUENTIELLE : elle
 * démontre que la CONDITION est évaluée à l'écriture et non lue plus tôt, ce
 * qui est le cœur du correctif, mais elle ne prouve pas l'isolation
 * transactionnelle de PostgreSQL ni le comportement des verrous pessimistes.
 *
 * Brancher un magasin réel sur `executerContratEcrituresConcurrentes` est la
 * première chose à faire le jour où un harnais existe : la fonction est
 * exportée pour ça, et n'attend qu'une fabrique.
 */

/** Ligne portant un solde et une poche bloquée — un portefeuille. */
export interface LignePortefeuille {
  id: string;
  solde: number;
  soldeBloque: number;
}

/** Ligne portant une quantité de titres — une position d'investissement. */
export interface LignePosition {
  id: string;
  nbTitres: number;
}

/**
 * Ce que toute implémentation doit fournir pour être éprouvée.
 *
 * Volontairement réduit aux quatre opérations conditionnelles réellement
 * utilisées par les chemins d'argent : le contrat ne décrit pas un ORM, il
 * décrit des garanties.
 */
export interface HarnaisEcritures {
  creerPortefeuille: (
    ligne: LignePortefeuille,
  ) => void | Promise<void>;
  lirePortefeuille: (id: string) => Promise<LignePortefeuille | null>;
  /** `solde -= dispo`, `soldeBloque -= bloque` SI les deux sont couverts. */
  debiterSiCouvert: (
    id: string,
    dispo: number,
    bloque: number,
  ) => Promise<boolean>;

  creerPosition: (ligne: LignePosition) => void | Promise<void>;
  lirePosition: (id: string) => Promise<LignePosition | null>;
  /** `nbTitres -= n` SI la position en détient au moins `n`. */
  retirerTitresSiDisponibles: (id: string, n: number) => Promise<boolean>;

  creerEtat: (id: string, statut: string) => void | Promise<void>;
  lireEtat: (id: string) => Promise<string | null>;
  /** Pose `cible` SI l'état courant vaut `attendu`. */
  transitionnerSi: (
    id: string,
    attendu: string,
    cible: string,
  ) => Promise<boolean>;

  /**
   * L'opération composée des deux chemins verrouillés : débit de l'acheteur,
   * retrait des titres du vendeur, crédit du vendeur — TOUT OU RIEN.
   */
  reglerCession: (ordre: OrdreCession) => Promise<boolean>;
}

/** Paramètres d'un règlement de cession. */
export interface OrdreCession {
  acheteurId: string;
  vendeurId: string;
  positionId: string;
  nbTitres: number;
  /** Prélevé sur la poche bloquée de l'acheteur (fonds réservés). */
  montantAcheteur: number;
  /** Crédité au vendeur — le NET, frais déjà retenus. */
  montantVendeur: number;
}

export function executerContratEcrituresConcurrentes(
  nom: string,
  fabrique: () => HarnaisEcritures,
): void {
  describe(`Contrat des écritures monétaires concurrentes — ${nom}`, () => {
    let h: HarnaisEcritures;

    beforeEach(() => {
      h = fabrique();
    });

    // ── 1. Débit conditionnel d'un portefeuille ────────────────────────────

    describe('débit conditionnel', () => {
      beforeEach(async () => {
        await h.creerPortefeuille({ id: 'w-1', solde: 100, soldeBloque: 50 });
      });

      it('accepte un débit exactement couvert', async () => {
        await expect(h.debiterSiCouvert('w-1', 100, 50)).resolves.toBe(true);
        await expect(h.lirePortefeuille('w-1')).resolves.toMatchObject({
          solde: 0,
          soldeBloque: 0,
        });
      });

      it('REFUSE un débit dépassant le disponible, sans rien déplacer', async () => {
        await expect(h.debiterSiCouvert('w-1', 100.01, 0)).resolves.toBe(false);
        await expect(h.lirePortefeuille('w-1')).resolves.toMatchObject({
          solde: 100,
          soldeBloque: 50,
        });
      });

      it('REFUSE un débit dépassant la poche bloquée', async () => {
        await expect(h.debiterSiCouvert('w-1', 0, 50.01)).resolves.toBe(false);
      });

      it('les DEUX conditions doivent tenir ensemble', async () => {
        // Disponible suffisant, bloqué insuffisant : le débit est refusé EN
        // BLOC. Appliquer la moitié couverte laisserait un règlement à demi
        // exécuté, pire que pas de règlement du tout.
        await expect(h.debiterSiCouvert('w-1', 10, 999)).resolves.toBe(false);
        await expect(h.lirePortefeuille('w-1')).resolves.toMatchObject({
          solde: 100,
        });
      });

      it('deux débits concurrents : un seul passe', async () => {
        const [a, b] = await Promise.all([
          h.debiterSiCouvert('w-1', 100, 0),
          h.debiterSiCouvert('w-1', 100, 0),
        ]);

        expect([a, b].filter(Boolean)).toHaveLength(1);
        await expect(h.lirePortefeuille('w-1')).resolves.toMatchObject({
          solde: 0,
        });
      });

      it('le solde ne passe JAMAIS en négatif', async () => {
        await Promise.all([
          h.debiterSiCouvert('w-1', 60, 0),
          h.debiterSiCouvert('w-1', 60, 0),
          h.debiterSiCouvert('w-1', 60, 0),
        ]);

        const apres = await h.lirePortefeuille('w-1');
        expect(apres!.solde).toBeGreaterThanOrEqual(0);
        expect(apres!.soldeBloque).toBeGreaterThanOrEqual(0);
      });

      it('un portefeuille inconnu ne peut pas être débité', async () => {
        await expect(h.debiterSiCouvert('w-inconnu', 1, 0)).resolves.toBe(false);
      });
    });

    // ── 2. Retrait de titres — la garde anti double-vente ──────────────────

    describe('retrait de titres', () => {
      beforeEach(async () => {
        await h.creerPosition({ id: 'inv-1', nbTitres: 10 });
      });

      it('accepte un retrait couvert', async () => {
        await expect(h.retirerTitresSiDisponibles('inv-1', 10)).resolves.toBe(
          true,
        );
        await expect(h.lirePosition('inv-1')).resolves.toMatchObject({
          nbTitres: 0,
        });
      });

      it('REFUSE de vendre plus de titres que détenus', async () => {
        await expect(h.retirerTitresSiDisponibles('inv-1', 11)).resolves.toBe(
          false,
        );
        await expect(h.lirePosition('inv-1')).resolves.toMatchObject({
          nbTitres: 10,
        });
      });

      it('DOUBLE-VENTE : deux règlements concurrents, un seul aboutit', async () => {
        // Le défaut corrigé : les deux lisaient 10, écrivaient tous deux 0, et
        // le vendeur livrait vingt fractions qu'il n'avait pas.
        const [a, b] = await Promise.all([
          h.retirerTitresSiDisponibles('inv-1', 10),
          h.retirerTitresSiDisponibles('inv-1', 10),
        ]);

        expect([a, b].filter(Boolean)).toHaveLength(1);
        await expect(h.lirePosition('inv-1')).resolves.toMatchObject({
          nbTitres: 0,
        });
      });

      it('la position ne passe JAMAIS en négatif', async () => {
        await Promise.all(
          Array.from({ length: 5 }, () =>
            h.retirerTitresSiDisponibles('inv-1', 4),
          ),
        );

        const apres = await h.lirePosition('inv-1');
        expect(apres!.nbTitres).toBeGreaterThanOrEqual(0);
      });

      it('remplissages partiels successifs : la somme retirée n’excède pas la position', async () => {
        const resultats = await Promise.all([
          h.retirerTitresSiDisponibles('inv-1', 6),
          h.retirerTitresSiDisponibles('inv-1', 6),
        ]);

        const retires = resultats.filter(Boolean).length * 6;
        expect(retires).toBeLessThanOrEqual(10);
      });
    });

    // ── 3. Transition d'état conditionnelle ───────────────────────────────

    describe('transition d’état', () => {
      beforeEach(async () => {
        await h.creerEtat('ordre-1', 'accepte');
      });

      it('applique la transition depuis l’état attendu', async () => {
        await expect(
          h.transitionnerSi('ordre-1', 'accepte', 'execute'),
        ).resolves.toBe(true);
        await expect(h.lireEtat('ordre-1')).resolves.toBe('execute');
      });

      it('REFUSE la transition depuis un autre état', async () => {
        await h.transitionnerSi('ordre-1', 'accepte', 'execute');

        // Une annonce déjà servie n'est jamais réécrite.
        await expect(
          h.transitionnerSi('ordre-1', 'accepte', 'annule'),
        ).resolves.toBe(false);
        await expect(h.lireEtat('ordre-1')).resolves.toBe('execute');
      });

      it('SINGLE-SHOT : deux transitions concurrentes, une seule aboutit', async () => {
        const [a, b] = await Promise.all([
          h.transitionnerSi('ordre-1', 'accepte', 'execute'),
          h.transitionnerSi('ordre-1', 'accepte', 'annule'),
        ]);

        expect([a, b].filter(Boolean)).toHaveLength(1);
      });
    });

    // ── 4. Règlement d'une cession — le chemin verrouillé au complet ───────

    describe('règlement atomique d’une cession', () => {
      const ORDRE: OrdreCession = {
        acheteurId: 'w-acheteur',
        vendeurId: 'w-vendeur',
        positionId: 'inv-vendeur',
        nbTitres: 5,
        montantAcheteur: 500,
        montantVendeur: 480,
      };

      /** Les fonds de l'acheteur sont RÉSERVÉS : ils sont dans la poche bloquée. */
      const provisionner = async (
        over: Partial<{ bloque: number; titres: number }> = {},
      ) => {
        await h.creerPortefeuille({
          id: ORDRE.acheteurId,
          solde: over.bloque ?? 500,
          soldeBloque: over.bloque ?? 500,
        });
        await h.creerPortefeuille({
          id: ORDRE.vendeurId,
          solde: 0,
          soldeBloque: 0,
        });
        await h.creerPosition({
          id: ORDRE.positionId,
          nbTitres: over.titres ?? 5,
        });
      };

      const etat = async () => ({
        acheteur: await h.lirePortefeuille(ORDRE.acheteurId),
        vendeur: await h.lirePortefeuille(ORDRE.vendeurId),
        position: await h.lirePosition(ORDRE.positionId),
      });

      it('règle une cession couverte', async () => {
        await provisionner();

        await expect(h.reglerCession(ORDRE)).resolves.toBe(true);

        const apres = await etat();
        expect(apres.acheteur).toMatchObject({ solde: 0, soldeBloque: 0 });
        expect(apres.vendeur).toMatchObject({ solde: 480 });
        expect(apres.position).toMatchObject({ nbTitres: 0 });
      });

      it('TOUT OU RIEN — position insuffisante : RIEN n’est déplacé', async () => {
        // Le pire scénario du chemin de cession : l'argent part, les titres
        // non. L'acheteur paie pour des fractions qu'il ne reçoit jamais.
        await provisionner({ titres: 2 });

        await expect(h.reglerCession(ORDRE)).resolves.toBe(false);

        const apres = await etat();
        expect(apres.acheteur).toMatchObject({ solde: 500, soldeBloque: 500 });
        expect(apres.vendeur).toMatchObject({ solde: 0 });
        expect(apres.position).toMatchObject({ nbTitres: 2 });
      });

      it('TOUT OU RIEN — fonds insuffisants : les titres RESTENT au vendeur', async () => {
        // Le symétrique : les titres changent de main sans contrepartie.
        await provisionner({ bloque: 100 });

        await expect(h.reglerCession(ORDRE)).resolves.toBe(false);

        const apres = await etat();
        expect(apres.position).toMatchObject({ nbTitres: 5 });
        expect(apres.vendeur).toMatchObject({ solde: 0 });
      });

      it('DOUBLE RÈGLEMENT de la même cession : un seul aboutit', async () => {
        await provisionner();

        const [a, b] = await Promise.all([
          h.reglerCession(ORDRE),
          h.reglerCession(ORDRE),
        ]);

        expect([a, b].filter(Boolean)).toHaveLength(1);
        const apres = await etat();
        expect(apres.position!.nbTitres).toBe(0);
        expect(apres.vendeur!.solde).toBe(480);
        expect(apres.acheteur!.solde).toBeGreaterThanOrEqual(0);
      });

      it('le règlement est ÉQUILIBRÉ : rien n’est créé, rien n’est perdu', async () => {
        await provisionner();
        const avant = await etat();
        const detenus = (e: Awaited<ReturnType<typeof etat>>) =>
          e.acheteur!.solde + e.vendeur!.solde;

        await h.reglerCession(ORDRE);
        const apres = await etat();

        // L'écart tient uniquement aux frais retenus (500 payés, 480 reçus) :
        // aucune monnaie n'apparaît du néant.
        const fraisRetenus = ORDRE.montantAcheteur - ORDRE.montantVendeur;
        expect(detenus(avant) - detenus(apres)).toBeCloseTo(fraisRetenus, 2);
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Implémentation en mémoire — le seul magasin disponible aujourd'hui.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Magasin en mémoire appliquant les conditions AU MOMENT de l'écriture.
 *
 * C'est le point : chaque opération relit la ligne juste avant d'écrire, comme
 * le fait la clause `WHERE` d'un `UPDATE`. Une implémentation qui capturerait
 * la valeur plus tôt reproduirait exactement le défaut corrigé — et échouerait
 * sur les cas « concurrents » de cette suite.
 */
function magasinEnMemoire(): HarnaisEcritures {
  const portefeuilles = new Map<string, LignePortefeuille>();
  const positions = new Map<string, LignePosition>();
  const etats = new Map<string, string>();

  return {
    creerPortefeuille: (ligne) => {
      portefeuilles.set(ligne.id, { ...ligne });
    },
    // Copie défensive : un dépôt réel rend une LIGNE, pas une référence vive
    // sur son stockage. Sans ça, un appelant qui garde le résultat verrait
    // ses valeurs changer sous lui — et un test comparant « avant » et
    // « après » comparerait deux fois la même chose.
    lirePortefeuille: async (id) => {
      const ligne = portefeuilles.get(id);
      return ligne ? { ...ligne } : null;
    },
    debiterSiCouvert: async (id, dispo, bloque) => {
      const ligne = portefeuilles.get(id);
      if (!ligne) return false;
      if (ligne.solde < dispo || ligne.soldeBloque < bloque) return false;
      ligne.solde = Math.round((ligne.solde - dispo) * 100) / 100;
      ligne.soldeBloque = Math.round((ligne.soldeBloque - bloque) * 100) / 100;
      return true;
    },

    creerPosition: (ligne) => {
      positions.set(ligne.id, { ...ligne });
    },
    lirePosition: async (id) => {
      const ligne = positions.get(id);
      return ligne ? { ...ligne } : null;
    },
    retirerTitresSiDisponibles: async (id, n) => {
      const ligne = positions.get(id);
      if (!ligne || ligne.nbTitres < n) return false;
      ligne.nbTitres -= n;
      return true;
    },

    creerEtat: (id, statut) => {
      etats.set(id, statut);
    },
    lireEtat: async (id) => etats.get(id) ?? null,
    transitionnerSi: async (id, attendu, cible) => {
      if (etats.get(id) !== attendu) return false;
      etats.set(id, cible);
      return true;
    },

    /**
     * Règlement TOUT OU RIEN.
     *
     * Chaque étape est conditionnelle ; la première qui échoue défait les
     * précédentes — l'équivalent en mémoire du `ROLLBACK` de la transaction
     * qui enveloppe le chemin réel.
     */
    reglerCession: async (ordre) => {
      const acheteur = portefeuilles.get(ordre.acheteurId);
      const vendeur = portefeuilles.get(ordre.vendeurId);
      const position = positions.get(ordre.positionId);
      if (!acheteur || !vendeur || !position) return false;

      // Ordre déterministe : les titres d'abord, l'argent ensuite. Peu
      // importe lequel, pourvu qu'il soit stable — c'est ce qui évite les
      // interblocages entre deux règlements croisés.
      if (position.nbTitres < ordre.nbTitres) return false;
      if (
        acheteur.solde < ordre.montantAcheteur ||
        acheteur.soldeBloque < ordre.montantAcheteur
      ) {
        return false;
      }

      position.nbTitres -= ordre.nbTitres;
      acheteur.solde = round2(acheteur.solde - ordre.montantAcheteur);
      acheteur.soldeBloque = round2(
        acheteur.soldeBloque - ordre.montantAcheteur,
      );
      vendeur.solde = round2(vendeur.solde + ordre.montantVendeur);
      return true;
    },
  };
}

/** Arrondi au centime — les flottants ne sont pas une monnaie. */
const round2 = (montant: number): number => Math.round(montant * 100) / 100;

executerContratEcrituresConcurrentes('magasin en mémoire', magasinEnMemoire);

// ═══════════════════════════════════════════════════════════════════════════
// Contre-épreuve — la suite ci-dessus PROUVE-T-ELLE quelque chose ?
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Magasin NAÏF reproduisant le défaut corrigé : « lire, calculer, réécrire »,
 * avec une frontière asynchrone entre la lecture et l'écriture.
 *
 * C'est exactement la forme qu'avaient `finalize-signed-contract.usecase.ts` et
 * l'annulation admin avant la passe 3 : `const w = await repo.findOne(...)`,
 * puis des calculs, puis `await repo.save(w)`. Deux exécutions concurrentes
 * lisent la MÊME valeur avant que l'une ait écrit.
 *
 * Il est ici pour une seule raison : démontrer que le contrat DISCRIMINE. Une
 * suite verte contre une implémentation correcte ne prouve rien tant qu'on n'a
 * pas montré qu'elle vire au rouge contre l'implémentation fautive.
 */
function magasinNaif(): HarnaisEcritures {
  const portefeuilles = new Map<string, LignePortefeuille>();
  const positions = new Map<string, LignePosition>();
  /** Frontière asynchrone : le `await` d'un aller-retour en base. */
  const allerRetour = () => new Promise((r) => setImmediate(r));

  return {
    creerPortefeuille: (ligne) => {
      portefeuilles.set(ligne.id, { ...ligne });
    },
    lirePortefeuille: async (id) => portefeuilles.get(id) ?? null,
    debiterSiCouvert: async (id, dispo, bloque) => {
      const ligne = portefeuilles.get(id);
      if (!ligne) return false;
      // La vérification porte sur une valeur LUE, pas sur la valeur au moment
      // de l'écriture — tout le défaut est là.
      const couvert = ligne.solde >= dispo && ligne.soldeBloque >= bloque;
      await allerRetour();
      if (!couvert) return false;
      ligne.solde -= dispo;
      ligne.soldeBloque -= bloque;
      return true;
    },

    creerPosition: (ligne) => {
      positions.set(ligne.id, { ...ligne });
    },
    lirePosition: async (id) => positions.get(id) ?? null,
    retirerTitresSiDisponibles: async (id, n) => {
      const ligne = positions.get(id);
      if (!ligne) return false;
      const disponible = ligne.nbTitres >= n;
      await allerRetour();
      if (!disponible) return false;
      ligne.nbTitres -= n;
      return true;
    },

    creerEtat: () => undefined,
    lireEtat: async () => null,
    transitionnerSi: async () => true,

    /** Même défaut au niveau composé : on vérifie, on attend, on écrit. */
    reglerCession: async (ordre) => {
      const acheteur = portefeuilles.get(ordre.acheteurId);
      const vendeur = portefeuilles.get(ordre.vendeurId);
      const position = positions.get(ordre.positionId);
      if (!acheteur || !vendeur || !position) return false;

      const possible =
        position.nbTitres >= ordre.nbTitres &&
        acheteur.soldeBloque >= ordre.montantAcheteur;
      await allerRetour();
      if (!possible) return false;

      position.nbTitres -= ordre.nbTitres;
      acheteur.solde -= ordre.montantAcheteur;
      acheteur.soldeBloque -= ordre.montantAcheteur;
      vendeur.solde += ordre.montantVendeur;
      return true;
    },
  };
}

describe('Contre-épreuve — le contrat détecte-t-il l’implémentation fautive ?', () => {
  it('le magasin NAÏF laisse passer la DOUBLE-VENTE que le contrat interdit', async () => {
    const naif = magasinNaif();
    await naif.creerPosition({ id: 'inv-1', nbTitres: 10 });

    const [a, b] = await Promise.all([
      naif.retirerTitresSiDisponibles('inv-1', 10),
      naif.retirerTitresSiDisponibles('inv-1', 10),
    ]);

    // Les deux réussissent, la position tombe à -10 : vingt fractions livrées
    // pour dix détenues. C'est le cas que la suite de contrat fait échouer.
    expect([a, b]).toEqual([true, true]);
    const apres = await naif.lirePosition('inv-1');
    expect(apres!.nbTitres).toBe(-10);
  });

  it('le magasin NAÏF laisse passer le DÉCOUVERT que le contrat interdit', async () => {
    const naif = magasinNaif();
    await naif.creerPortefeuille({ id: 'w-1', solde: 100, soldeBloque: 0 });

    await Promise.all([
      naif.debiterSiCouvert('w-1', 100, 0),
      naif.debiterSiCouvert('w-1', 100, 0),
    ]);

    const apres = await naif.lirePortefeuille('w-1');
    expect(apres!.solde).toBeLessThan(0);
  });

  it('le magasin NAÏF règle DEUX FOIS la même cession', async () => {
    const naif = magasinNaif();
    await naif.creerPortefeuille({
      id: 'w-acheteur',
      solde: 500,
      soldeBloque: 500,
    });
    await naif.creerPortefeuille({ id: 'w-vendeur', solde: 0, soldeBloque: 0 });
    await naif.creerPosition({ id: 'inv-vendeur', nbTitres: 5 });

    const ordre = {
      acheteurId: 'w-acheteur',
      vendeurId: 'w-vendeur',
      positionId: 'inv-vendeur',
      nbTitres: 5,
      montantAcheteur: 500,
      montantVendeur: 480,
    };
    await Promise.all([naif.reglerCession(ordre), naif.reglerCession(ordre)]);

    // Le vendeur encaisse 960 pour cinq fractions vendues une fois, et sa
    // position tombe à -5. C'est très exactement le sinistre que la clause
    // conditionnelle rend impossible.
    expect((await naif.lirePortefeuille('w-vendeur'))!.solde).toBe(960);
    expect((await naif.lirePosition('inv-vendeur'))!.nbTitres).toBe(-5);
  });

  it('le magasin CORRIGÉ refuse les deux, sur les mêmes scénarios', async () => {
    // Même entrée, même concurrence, autre issue : la différence tient
    // uniquement à l'évaluation de la condition AU MOMENT de l'écriture.
    const corrige = magasinEnMemoire();
    await corrige.creerPosition({ id: 'inv-1', nbTitres: 10 });
    await corrige.creerPortefeuille({ id: 'w-1', solde: 100, soldeBloque: 0 });

    const titres = await Promise.all([
      corrige.retirerTitresSiDisponibles('inv-1', 10),
      corrige.retirerTitresSiDisponibles('inv-1', 10),
    ]);
    const debits = await Promise.all([
      corrige.debiterSiCouvert('w-1', 100, 0),
      corrige.debiterSiCouvert('w-1', 100, 0),
    ]);

    expect(titres.filter(Boolean)).toHaveLength(1);
    expect(debits.filter(Boolean)).toHaveLength(1);
    expect((await corrige.lirePosition('inv-1'))!.nbTitres).toBe(0);
    expect((await corrige.lirePortefeuille('w-1'))!.solde).toBe(0);
  });
});

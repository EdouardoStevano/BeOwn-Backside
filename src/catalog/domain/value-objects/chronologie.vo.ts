export type StatutEtape = 'done' | 'in_progress' | 'pending';

/** Un jalon de la chronologie publique du projet. */
export interface EtapeChronologie {
  etape: string;
  /** Date civile ISO `AAAA-MM-JJ`. */
  date: string;
  statut: StatutEtape;
  description?: string;
}

/**
 * Chronologie du projet : la suite de ses jalons, et la règle qui en déduit
 * l'avancement.
 *
 * La règle — *ce qui est daté d'hier est fait, le prochain jalon est en cours,
 * les suivants sont à venir* — vivait dans `applications/chronologie-status.ts`
 * sous forme de fonction libre, appelée par un CRON. C'est du métier pur : elle
 * ne dépend que d'une liste et d'une date, et elle décide ce que le site public
 * affiche comme avancement. Elle appartient donc au domaine (§6), au même titre
 * que la table des transitions de statut.
 *
 * **Immuable** : {@link avancerAu} rend une nouvelle chronologie plutôt que de
 * réécrire celle-ci, ce qui permet au CRON de comparer l'avant et l'après pour
 * n'écrire en base que les projets réellement modifiés.
 */
export class Chronologie {
  private constructor(private readonly etapes: readonly EtapeChronologie[]) {}

  static vide(): Chronologie {
    return new Chronologie([]);
  }

  /**
   * Reconstitution depuis la persistance ou depuis une entrée déjà validée.
   *
   * Tolérante à ce que la colonne `jsonb` peut réellement contenir : `null` sur
   * les lignes antérieures au défaut `[]`, et — le contrôle est conservé de
   * `computeChronologieStatuts` — toute valeur qui n'est pas un tableau. Elle
   * ne juge pas les statuts reçus : {@link avancerAu} les recalcule.
   */
  static restore(
    etapes: readonly EtapeChronologie[] | null | undefined,
  ): Chronologie {
    // `Array.isArray` élargit à `any[]` : on repasse par le type déclaré, la
    // garde ne servant qu'à écarter ce que la colonne pourrait contenir de
    // travers.
    const liste: readonly EtapeChronologie[] = Array.isArray(etapes)
      ? etapes
      : [];
    return new Chronologie([...liste]);
  }

  get estVide(): boolean {
    return this.etapes.length === 0;
  }

  /**
   * Statuts recalculés au jour dit : les jalons échus passent `done`, le
   * premier jalon à venir `in_progress`, les suivants `pending`.
   *
   * Ne lève jamais — une chronologie mal saisie ne doit pas faire échouer le
   * CRON qui balaie tous les projets ouverts.
   */
  avancerAu(jour: Date): Chronologie {
    if (this.estVide) return this;

    const minuit = auDebutDuJour(jour);
    let prochainDesigne = false;

    return new Chronologie(
      this.etapes.map((etape) => {
        let statut: StatutEtape;
        if (auDebutDuJour(new Date(etape.date)).getTime() <= minuit.getTime()) {
          statut = 'done';
        } else if (!prochainDesigne) {
          statut = 'in_progress';
          prochainDesigne = true;
        } else {
          statut = 'pending';
        }
        return { ...etape, statut };
      }),
    );
  }

  /**
   * Vrai si l'avancement diffère, jalon à jalon.
   *
   * Le CRON écrivait la comparaison lui-même (`next.some((e, i) => e.statut !==
   * current[i]?.statut)`) : c'est la chronologie qui sait ce qui, chez elle,
   * constitue un changement.
   */
  differeDe(autre: Chronologie): boolean {
    if (this.etapes.length !== autre.etapes.length) return true;
    return this.etapes.some(
      (etape, i) => etape.statut !== autre.etapes[i]?.statut,
    );
  }

  toSnapshot(): EtapeChronologie[] {
    return this.etapes.map((etape) => ({ ...etape }));
  }
}

/**
 * Un jalon est daté au jour, pas à l'instant : comparer des horodatages ferait
 * dépendre l'avancement de l'heure à laquelle le CRON tourne.
 */
function auDebutDuJour(date: Date): Date {
  const copie = new Date(date);
  copie.setHours(0, 0, 0, 0);
  return copie;
}

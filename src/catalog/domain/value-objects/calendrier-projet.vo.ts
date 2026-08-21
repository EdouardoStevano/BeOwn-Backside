import { ChampProjetInvalideError } from '../errors/project.errors';

export interface CalendrierProjetSnapshot {
  datePublication: Date | null;
  dateOuvertureCollecte: Date | null;
  dateCloturePrevue: Date | null;
}

export type CalendrierProjetProps = Partial<{
  datePublication: Date | string | null;
  dateOuvertureCollecte: Date | string | null;
  dateCloturePrevue: Date | string | null;
}>;

/**
 * Les trois jalons du projet : publication de l'annonce, ouverture de la
 * collecte, clôture prévue.
 *
 * Ils se contraignent dans cet ordre — on n'ouvre pas une collecte avant
 * d'avoir publié l'annonce, on ne prévoit pas de clôturer avant d'avoir
 * ouvert. La règle n'était écrite nulle part, et deux des trois dates étaient
 * posées **par le repository TypeORM** : `updateProjectStatus` estampillait
 * `datePublication` au passage en `ANNONCE`/`EN_COLLECTE` et
 * `dateOuvertureCollecte` au passage en `EN_COLLECTE` — c'est-à-dire une règle
 * métier dans un adapter de sortie (§1). Elle vit maintenant dans
 * {@link Project.changerStatut}, via {@link auPassageEnAnnonce} et
 * {@link auPassageEnCollecte}.
 *
 * `UpdateProjectUseCase` atteignait ces deux mêmes dates par une série de
 * `(dto as any).datePublication` : elles n'existaient pas sur le DTO, mais la
 * mise à jour les écrivait quand même.
 */
export class CalendrierProjet {
  private constructor(private readonly etat: CalendrierProjetSnapshot) {}

  static vierge(): CalendrierProjet {
    return new CalendrierProjet({
      datePublication: null,
      dateOuvertureCollecte: null,
      dateCloturePrevue: null,
    });
  }

  static of(props: CalendrierProjetProps = {}): CalendrierProjet {
    const datePublication = dateOuNull(
      'datePublication',
      props.datePublication,
    );
    const dateOuvertureCollecte = dateOuNull(
      'dateOuvertureCollecte',
      props.dateOuvertureCollecte,
    );
    const dateCloturePrevue = dateOuNull(
      'dateCloturePrevue',
      props.dateCloturePrevue,
    );

    if (
      datePublication &&
      dateOuvertureCollecte &&
      dateOuvertureCollecte < datePublication
    ) {
      throw new ChampProjetInvalideError(
        'dateOuvertureCollecte',
        "la collecte ne peut pas s'ouvrir avant la publication de l'annonce.",
      );
    }
    const debut = dateOuvertureCollecte ?? datePublication;
    if (debut && dateCloturePrevue && dateCloturePrevue < debut) {
      throw new ChampProjetInvalideError(
        'dateCloturePrevue',
        'la clôture ne peut pas précéder le début de la collecte.',
      );
    }

    return new CalendrierProjet({
      datePublication,
      dateOuvertureCollecte,
      dateCloturePrevue,
    });
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `Localisation`). */
  static restore(snapshot: CalendrierProjetSnapshot): CalendrierProjet {
    return new CalendrierProjet({ ...snapshot });
  }

  /** Nouveau calendrier où seuls les jalons fournis changent, revalidé. */
  avec(props: CalendrierProjetProps): CalendrierProjet {
    const e = this.etat;
    return CalendrierProjet.of({
      datePublication:
        props.datePublication !== undefined
          ? props.datePublication
          : e.datePublication,
      dateOuvertureCollecte:
        props.dateOuvertureCollecte !== undefined
          ? props.dateOuvertureCollecte
          : e.dateOuvertureCollecte,
      dateCloturePrevue:
        props.dateCloturePrevue !== undefined
          ? props.dateCloturePrevue
          : e.dateCloturePrevue,
    });
  }

  /**
   * Le projet vient d'être annoncé : sa date de publication est celle du jour.
   *
   * Estampillée à chaque passage, y compris depuis `EN_COLLECTE` — c'est le
   * comportement du repository qu'on reprend tel quel, la date publiée est
   * celle de la dernière mise en visibilité.
   */
  auPassageEnAnnonce(maintenant: Date): CalendrierProjet {
    return new CalendrierProjet({ ...this.etat, datePublication: maintenant });
  }

  /** La collecte vient d'ouvrir : les deux jalons amont sont posés au jour. */
  auPassageEnCollecte(maintenant: Date): CalendrierProjet {
    return new CalendrierProjet({
      ...this.etat,
      datePublication: maintenant,
      dateOuvertureCollecte: maintenant,
    });
  }

  get datePublication(): Date | null {
    return this.etat.datePublication;
  }
  get dateOuvertureCollecte(): Date | null {
    return this.etat.dateOuvertureCollecte;
  }
  get dateCloturePrevue(): Date | null {
    return this.etat.dateCloturePrevue;
  }

  toSnapshot(): CalendrierProjetSnapshot {
    return { ...this.etat };
  }
}

/**
 * Les DTO transportent des dates ISO 8601 (`@IsDateString`), la persistance des
 * `Date` : les deux formes sont acceptées, une chaîne illisible est refusée
 * plutôt que convertie en `Invalid Date` — ce que faisait `new Date(dto.x)`
 * sans jamais le vérifier.
 */
function dateOuNull(
  champ: string,
  valeur: Date | string | null | undefined,
): Date | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const date = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(date.getTime())) {
    throw new ChampProjetInvalideError(champ, 'date illisible.');
  }
  return date;
}

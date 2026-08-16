import { siDeclare } from './champ-declare';
import { Libelle } from './libelle.vo';

const MAX_LIBELLE = 100;

/** Ce que le titulaire déclare de son activité. */
export interface ChampsSituationProfessionnelle {
  profession?: string | null;
  secteurActivite?: string | null;
}

export interface SituationProfessionnelleSnapshot {
  profession: string | null;
  secteurActivite: string | null;
}

interface EtatSituationProfessionnelle {
  profession: Libelle | null;
  secteurActivite: Libelle | null;
}

/**
 * Activité déclarée du titulaire : profession et secteur.
 *
 * Deux champs seulement, mais un sujet à part entière : ils alimentent
 * l'analyse LCB-FT (un secteur figurant parmi les activités sensibles pèse sur
 * le score de risque) et la pré-qualification PSFP (« travaillez-vous dans le
 * secteur financier ? »). Les tenir ensemble donne un endroit évident où
 * accrocher ces règles le jour où elles quittent le questionnaire — plutôt
 * qu'un dix-septième champ à plat dans l'agrégat.
 *
 * **Immuable** — cf. `Identite`.
 */
export class SituationProfessionnelle {
  private constructor(private readonly etat: EtatSituationProfessionnelle) {}

  static declarer(
    champs: ChampsSituationProfessionnelle = {},
  ): SituationProfessionnelle {
    return new SituationProfessionnelle({
      profession: Libelle.of(
        champs.profession,
        'La profession',
        'profession',
        MAX_LIBELLE,
      ),
      secteurActivite: Libelle.of(
        champs.secteurActivite,
        "Le secteur d'activité",
        'secteurActivite',
        MAX_LIBELLE,
      ),
    });
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(
    snapshot: SituationProfessionnelleSnapshot,
  ): SituationProfessionnelle {
    return new SituationProfessionnelle({
      profession: Libelle.restore(snapshot.profession),
      secteurActivite: Libelle.restore(snapshot.secteurActivite),
    });
  }

  avec(champs: ChampsSituationProfessionnelle): SituationProfessionnelle {
    return new SituationProfessionnelle({
      profession: siDeclare(
        champs.profession,
        (v) => Libelle.of(v, 'La profession', 'profession', MAX_LIBELLE),
        this.etat.profession,
      ),
      secteurActivite: siDeclare(
        champs.secteurActivite,
        (v) =>
          Libelle.of(
            v,
            "Le secteur d'activité",
            'secteurActivite',
            MAX_LIBELLE,
          ),
        this.etat.secteurActivite,
      ),
    });
  }

  get profession(): string | null {
    return this.etat.profession?.value ?? null;
  }
  get secteurActivite(): string | null {
    return this.etat.secteurActivite?.value ?? null;
  }

  equals(other: SituationProfessionnelle): boolean {
    return (
      this.profession === other.profession &&
      this.secteurActivite === other.secteurActivite
    );
  }

  toSnapshot(): SituationProfessionnelleSnapshot {
    return {
      profession: this.profession,
      secteurActivite: this.secteurActivite,
    };
  }
}

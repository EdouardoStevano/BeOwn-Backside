/**
 * La nature du profil au nom duquel un compte agit.
 *
 * Reprend les deux lettres que le cahier des charges emploie, et que le front
 * affiche déjà — voir `TypeInvestisseur` dans l'avancement d'entrée en relation.
 */
export enum NatureProfilInvestisseur {
  PP = 'PP',
  PM = 'PM',
}

export interface ProfilInvestisseurSnapshot {
  nature: NatureProfilInvestisseur;
  /** L'identité de la société ; `null` quand on agit en son nom propre. */
  societeId: string | null;
}

/**
 * Au nom de qui un compte agit : lui-même, ou l'une de ses sociétés.
 *
 * C'est le concept que le cahier des charges suppose sans le nommer —
 * *« investir via les entreprises dont il est le représentant légal sans avoir
 * besoin de se créer plusieurs comptes »*. Un compte porte un dossier personne
 * physique **et** autant de sociétés qu'il en représente ; encore faut-il
 * pouvoir dire, à un instant donné, laquelle de ces identités est celle qui
 * agit.
 *
 * Deux classes plutôt qu'un couple `(nature, societeId)` : la société **a** une
 * identité, la personne physique n'en a pas à porter, et le type le dit. Un
 * enregistrement plat aurait laissé exister un `PP` avec un `societeId`, ou un
 * `PM` sans — deux états que rien n'aurait empêchés d'être écrits (même raison
 * que `ClassementPsfp`).
 *
 * **Immuable** — cf. `Identite`. Basculer ne modifie pas ce profil-ci, cela en
 * désigne un autre.
 */
export abstract class ProfilInvestisseur {
  abstract readonly nature: NatureProfilInvestisseur;

  /**
   * Le compte agit en son nom propre.
   *
   * C'est le repli, et le seul défaut acceptable : agir pour soi n'engage que
   * soi, alors que retomber par défaut sur une société ferait souscrire au nom
   * d'une personne morale sans que personne l'ait demandé.
   */
  static personnePhysique(): ProfilInvestisseur {
    return new PersonnePhysiqueInvestisseur();
  }

  static societe(societeId: string): ProfilInvestisseur {
    return new SocieteInvestisseur(societeId);
  }

  /**
   * Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`).
   *
   * Une ligne sans `societeId` est une personne physique : c'est ainsi que la
   * colonne représente le nom propre, et non un choix incomplet.
   */
  static restore(societeId: string | null): ProfilInvestisseur {
    return societeId === null || societeId === ''
      ? ProfilInvestisseur.personnePhysique()
      : ProfilInvestisseur.societe(societeId);
  }

  estPersonnePhysique(): boolean {
    return false;
  }

  estSociete(): boolean {
    return false;
  }

  /** `null` pour la personne physique — elle n'a pas de société à désigner. */
  get societeId(): string | null {
    return null;
  }

  /** Deux profils désignent la même identité agissante. */
  equals(autre: ProfilInvestisseur): boolean {
    return this.nature === autre.nature && this.societeId === autre.societeId;
  }

  toSnapshot(): ProfilInvestisseurSnapshot {
    return { nature: this.nature, societeId: this.societeId };
  }
}

/** Le titulaire agit pour lui-même : c'est son dossier personne physique. */
export class PersonnePhysiqueInvestisseur extends ProfilInvestisseur {
  readonly nature = NatureProfilInvestisseur.PP;

  override estPersonnePhysique(): boolean {
    return true;
  }
}

/**
 * Le titulaire agit pour une société qu'il représente.
 *
 * Elle porte son identité, et c'est ce qui distingue deux sociétés du même
 * compte — sans quoi « basculer » ne saurait pas vers laquelle.
 */
export class SocieteInvestisseur extends ProfilInvestisseur {
  readonly nature = NatureProfilInvestisseur.PM;

  constructor(private readonly _societeId: string) {
    super();
  }

  override estSociete(): boolean {
    return true;
  }

  override get societeId(): string {
    return this._societeId;
  }
}

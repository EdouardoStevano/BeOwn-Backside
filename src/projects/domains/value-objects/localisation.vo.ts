import { ChampProjetInvalideError } from '../errors/project.errors';

export interface LocalisationSnapshot {
  ville: string | null;
  region: string | null;
  pays: string;
  adresseComplete: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Ce qu'un appelant peut proposer : tout est optionnel, le pays a un défaut. */
export type LocalisationProps = Partial<Omit<LocalisationSnapshot, 'pays'>> & {
  pays?: string | null;
};

/**
 * Où se trouve le bien.
 *
 * Les six champs se tenaient à plat sur l'agrégat et se recopiaient un à un —
 * six affectations à la création, six `if` à la mise à jour, et un bloc
 * `localisation` reconstruit clé par clé dans `ProjectReadModelService`. Ils
 * partagent pourtant un invariant qui n'était énoncé nulle part : **une
 * coordonnée se donne entière**. Une latitude sans longitude ne place rien sur
 * une carte ; affichée telle quelle par le front, elle pointe le méridien de
 * Greenwich à la bonne latitude — c'est-à-dire un endroit faux, et non un
 * endroit manquant.
 *
 * ⚠️ Changement de comportement assumé : la création acceptait jusqu'ici une
 * demi-coordonnée. Les formulaires d'administration les posent par sélection
 * sur une carte, donc toujours par paire.
 */
export class Localisation {
  /**
   * Le pays par défaut est `FR`, comme le `default` de la colonne et comme
   * `CreateProjectUseCase`. `UpdateProjectUseCase` retombait, lui, sur `'CI'` :
   * un projet dont on effaçait le pays changeait de juridiction au passage.
   * C'était un bug, corrigé par le fait qu'il n'y a plus qu'un seul défaut.
   */
  static readonly PAYS_PAR_DEFAUT = 'FR';

  private constructor(private readonly etat: LocalisationSnapshot) {}

  static of(props: LocalisationProps = {}): Localisation {
    const pays = normaliserPays(props.pays);
    const latitude = props.latitude ?? null;
    const longitude = props.longitude ?? null;

    if ((latitude === null) !== (longitude === null)) {
      throw new ChampProjetInvalideError(
        'latitude/longitude',
        'une coordonnée se donne entière — latitude et longitude, ou aucune des deux.',
      );
    }
    if (latitude !== null && (latitude < -90 || latitude > 90)) {
      throw new ChampProjetInvalideError(
        'latitude',
        'attendue entre -90 et 90.',
      );
    }
    if (longitude !== null && (longitude < -180 || longitude > 180)) {
      throw new ChampProjetInvalideError(
        'longitude',
        'attendue entre -180 et 180.',
      );
    }

    return new Localisation({
      ville: videOuNull(props.ville),
      region: videOuNull(props.region),
      pays,
      adresseComplete: videOuNull(props.adresseComplete),
      latitude,
      longitude,
    });
  }

  /**
   * Reconstitution depuis la persistance, sans contrôle.
   *
   * Les lignes antérieures à cet invariant peuvent porter une demi-coordonnée :
   * les relire doit rester possible, sans quoi le catalogue deviendrait
   * illisible. C'est la même règle que partout ailleurs — on éprouve ce qui
   * entre, pas ce qui est déjà écrit (cf. `DecisionKyc.restore`).
   */
  static restore(snapshot: LocalisationSnapshot): Localisation {
    return new Localisation({
      ville: snapshot.ville,
      region: snapshot.region,
      pays: snapshot.pays ?? Localisation.PAYS_PAR_DEFAUT,
      adresseComplete: snapshot.adresseComplete,
      latitude: snapshot.latitude != null ? Number(snapshot.latitude) : null,
      longitude: snapshot.longitude != null ? Number(snapshot.longitude) : null,
    });
  }

  /**
   * Nouvelle localisation où seuls les champs fournis changent.
   *
   * `undefined` veut dire « ne touche pas », `null` veut dire « efface » — la
   * distinction que les quarante `if (dto.x !== undefined)` de
   * `UpdateProjectUseCase` faisaient à la main, champ par champ.
   */
  avec(props: LocalisationProps): Localisation {
    return Localisation.of({
      ville: props.ville !== undefined ? props.ville : this.etat.ville,
      region: props.region !== undefined ? props.region : this.etat.region,
      pays: props.pays !== undefined ? props.pays : this.etat.pays,
      adresseComplete:
        props.adresseComplete !== undefined
          ? props.adresseComplete
          : this.etat.adresseComplete,
      latitude:
        props.latitude !== undefined ? props.latitude : this.etat.latitude,
      longitude:
        props.longitude !== undefined ? props.longitude : this.etat.longitude,
    });
  }

  get ville(): string | null {
    return this.etat.ville;
  }
  get region(): string | null {
    return this.etat.region;
  }
  get pays(): string {
    return this.etat.pays;
  }
  get adresseComplete(): string | null {
    return this.etat.adresseComplete;
  }
  get latitude(): number | null {
    return this.etat.latitude;
  }
  get longitude(): number | null {
    return this.etat.longitude;
  }

  /**
   * Libellé « Ville, Pays » utilisé par les annonces.
   *
   * Les deux notifications de `ProjectController` le recomposaient chacune de
   * leur côté (`[project.ville, project.pays].filter(Boolean).join(', ')`).
   */
  get libelleCourt(): string {
    return [this.etat.ville, this.etat.pays].filter(Boolean).join(', ');
  }

  toSnapshot(): LocalisationSnapshot {
    return { ...this.etat };
  }
}

/** Code ISO 3166-1 alpha-2 : la colonne est un `char(2)`. */
function normaliserPays(pays: string | null | undefined): string {
  const brut = (pays ?? '').trim().toUpperCase();
  if (brut === '') return Localisation.PAYS_PAR_DEFAUT;
  if (!/^[A-Z]{2}$/.test(brut)) {
    throw new ChampProjetInvalideError(
      'pays',
      'attendu au format ISO 3166-1 alpha-2 (deux lettres), ex. « FR ».',
    );
  }
  return brut;
}

function videOuNull(valeur: string | null | undefined): string | null {
  const brut = valeur?.trim();
  return brut ? brut : null;
}

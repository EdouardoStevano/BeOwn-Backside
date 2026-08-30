import { ChampProfilInvalideError } from 'src/onboarding/domain/errors/champ-profil.errors';

/** Formats qu'un service de conformité sait relire — et qu'un PSP accepte. */
const MIMES_ACCEPTES: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** 10 Mo : au-delà, c'est un scan non compressé, pas un justificatif. */
const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;

const CHAMP = 'fichier';

export interface FichierDeposeSnapshot {
  nomOrigine: string;
  cleStockage: string;
  url: string;
  mimeType: string;
  tailleOctets: number;
}

/**
 * Le fichier tel qu'il a été déposé et rangé : son nom d'origine, où le
 * retrouver, et de quoi il est fait.
 *
 * **Il ne contient pas les octets.** Le domaine n'a jamais à les lire : ce
 * qu'il protège, c'est qu'un justificatif soit lisible par qui devra
 * l'instruire, et cela se décide sur le type MIME et la taille. Les octets
 * vivent dans le magasin de fichiers, derrière le port du contexte (§20) ;
 * la clé les y retrouve.
 *
 * Les cinq champs forment un bloc parce qu'ils décrivent un seul objet et
 * n'ont aucun sens séparés — une clé de stockage sans type MIME désigne des
 * octets qu'on ne saura pas rendre, et une taille sans clé ne désigne rien.
 *
 * **Immuable** — cf. `Identite`. Corriger un justificatif, ce n'est pas
 * modifier ce fichier-ci, c'est en déposer un autre.
 */
export class FichierDepose {
  private constructor(private readonly etat: FichierDeposeSnapshot) {}

  /**
   * Premier dépôt : ce que le contrôleur a reçu et rangé.
   *
   * Les bornes sont éprouvées **ici** et non dans le seul `FileInterceptor` :
   * celui-ci ne couvre que la route HTTP, et un import de reprise ou un futur
   * appelant interne n'y passent pas. La règle vaut partout (cf.
   * `CapaciteDePerte`).
   */
  static depose(champs: {
    nomOrigine: string;
    cleStockage: string;
    url: string;
    mimeType: string;
    tailleOctets: number;
  }): FichierDepose {
    if (!MIMES_ACCEPTES.includes(champs.mimeType)) {
      throw new ChampProfilInvalideError(
        'Le justificatif',
        `doit être un PDF ou une image (${MIMES_ACCEPTES.join(', ')}).`,
        CHAMP,
      );
    }
    if (!Number.isFinite(champs.tailleOctets) || champs.tailleOctets <= 0) {
      throw new ChampProfilInvalideError('Le justificatif', 'est vide.', CHAMP);
    }
    if (champs.tailleOctets > TAILLE_MAX_OCTETS) {
      throw new ChampProfilInvalideError(
        'Le justificatif',
        `dépasse ${TAILLE_MAX_OCTETS / (1024 * 1024)} Mo.`,
        CHAMP,
      );
    }
    if (champs.cleStockage.trim().length === 0) {
      throw new ChampProfilInvalideError(
        'Le justificatif',
        "n'a pas été rangé : sa clé de stockage est vide.",
        CHAMP,
      );
    }

    return new FichierDepose({ ...champs });
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: FichierDeposeSnapshot): FichierDepose {
    return new FichierDepose({ ...snapshot });
  }

  get nomOrigine(): string {
    return this.etat.nomOrigine;
  }
  get cleStockage(): string {
    return this.etat.cleStockage;
  }
  get url(): string {
    return this.etat.url;
  }
  get mimeType(): string {
    return this.etat.mimeType;
  }
  get tailleOctets(): number {
    return this.etat.tailleOctets;
  }

  toSnapshot(): FichierDeposeSnapshot {
    return { ...this.etat };
  }
}

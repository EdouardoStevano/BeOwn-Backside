import { RegimeFiscal } from '../enums/regime-fiscal.enum';
import { SpvMapper } from '../mappers/spv.mapper';

/**
 * État complet de la société de projet, tel qu'il transite depuis/vers la
 * persistance et tel qu'il est publié. Les clés sont celles rendues avant le
 * découpage — `POST /projects/spv` et `GET /projects/spv/list` sont inchangés.
 */
export interface SpvSnapshot {
  id: string;
  raisonSociale: string;
  /**
   * Immatriculation. Le nom du champ reste `siren` même si la valeur peut être
   * un SIREN (FR) ou un RCCM (UEMOA) selon la juridiction.
   */
  siren: string | null;
  /** Forme sociale : `SCI`, `SARL`, `SAS`… */
  forme: string | null;
  capitalSocial: number | null;
  siegeAdresse: string | null;
  /** Colonne `select: false` : absente de la plupart des lectures. */
  iban: string | null;
  dateConstitution: Date | null;
  statutsPdfUrl: string | null;
  regimeFiscal: RegimeFiscal;
  gestionnaireUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Ce que `restore` accepte : le snapshot, tolérant sur les colonnes absentes. */
export interface SpvSnapshotBrut extends Omit<
  SpvSnapshot,
  'iban' | 'regimeFiscal'
> {
  iban?: string | null;
  regimeFiscal?: RegimeFiscal | null;
}

/**
 * Société de Projet — entité légale propriétaire d'un projet immobilier.
 *
 * Pour les projets equity-locatif, c'est une SCI dédiée par projet : elle
 * détient le bien, signe les baux, encaisse les loyers, paye les charges.
 *
 * Champs hérités (rétrocompat) : `siren`, `forme`, `siegeAdresse`, `iban`,
 * `capitalSocial`. Champs equity-locatif (Phase 1) : `dateConstitution`,
 * `statutsPdfUrl`, `regimeFiscal`, `gestionnaireUserId`.
 *
 * L'agrégat naissait **dans le contrôleur** : douze affectations sur un `new
 * Spv()`, valeurs par défaut comprises (`iban = null`, `regimeFiscal = IS`),
 * juste avant l'appel au repository (§12.5). Aucune de ses règles n'était donc
 * énoncée quelque part, et un second point d'entrée les aurait redécidées.
 * Naître appartient à {@link SpvFactory}, renaître à {@link SpvMapper}.
 *
 * **Aucune transition, et c'est délibéré.** Rien ne modifie une SPV
 * aujourd'hui : elle se crée et se lit. Tous les attributs sont donc
 * `readonly` — l'agrégat est exact sur ce qu'il garantit.
 */
export class Spv {
  private readonly etat: SpvSnapshot;

  /** @internal Réservé à `SpvFactory` et `SpvMapper` — cf. `Kyc`. */
  constructor(etat: SpvSnapshot) {
    this.etat = etat;
  }

  get id(): string {
    return this.etat.id;
  }
  get raisonSociale(): string {
    return this.etat.raisonSociale;
  }
  get siren(): string | null {
    return this.etat.siren;
  }
  get forme(): string | null {
    return this.etat.forme;
  }
  get capitalSocial(): number | null {
    return this.etat.capitalSocial;
  }
  get siegeAdresse(): string | null {
    return this.etat.siegeAdresse;
  }
  get iban(): string | null {
    return this.etat.iban;
  }
  get dateConstitution(): Date | null {
    return this.etat.dateConstitution;
  }
  get statutsPdfUrl(): string | null {
    return this.etat.statutsPdfUrl;
  }
  get regimeFiscal(): RegimeFiscal {
    return this.etat.regimeFiscal;
  }
  get gestionnaireUserId(): number | null {
    return this.etat.gestionnaireUserId;
  }
  get createdAt(): Date {
    return this.etat.createdAt;
  }
  get updatedAt(): Date {
    return this.etat.updatedAt;
  }

  /** @see Project.toJSON — même rôle, même piège avec la décomposition. */
  toJSON(): SpvSnapshot {
    return this.toSnapshot();
  }

  toSnapshot(): SpvSnapshot {
    return SpvMapper.toSnapshot(this);
  }
}

import { ChampProfilInvalideError } from './errors';
import { ProfilPMMapper } from './mappers/profil-pm.mapper';
import { CapitalSocial } from './value-objects/capital-social.vo';
import { siDeclare } from './value-objects/champ-declare';
import {
  ChampsIdentiteLegale,
  IdentiteLegale,
  IdentiteLegaleSnapshot,
} from './value-objects/identite-legale.vo';
import { Libelle } from './value-objects/libelle.vo';

const MAX_SIEGE = 200;
const MAX_SECTEUR = 100;

/**
 * Tout ce que le titulaire déclare de sa société.
 *
 * Le type est **composé** de celui du bloc `IdentiteLegale` plutôt qu'écrit à
 * plat : ajouter un champ à l'identité légale l'ajoute ici sans qu'on y pense.
 */
export type ChampsDeclaresProfilPM = ChampsIdentiteLegale & {
  capitalSocial?: number | string | null;
  siegeAdresse?: string | null;
  secteurActivite?: string | null;
  /** Compte du représentant légal — jamais renseigné par le formulaire HTTP. */
  representantId?: number | null;
};

/** Ce que le profil ajoute à son bloc : sa clé et ses dates. */
export interface EnteteProfilPM {
  utilisateurId: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * État complet du profil, tel qu'il transite depuis/vers la persistance.
 *
 * Des primitives uniquement, à plat : les Value Objects ne franchissent pas la
 * frontière du domaine (§12.7), et la forme plate est celle de la table.
 */
export interface ProfilPMSnapshot
  extends EnteteProfilPM, IdentiteLegaleSnapshot {
  capitalSocial: number | null;
  siegeAdresse: string | null;
  secteurActivite: string | null;
  representantId: number | null;
}

/**
 * Ce que `restore` accepte : le snapshot, mais tolérant sur la forme que rend
 * réellement le driver Postgres — une chaîne pour une colonne `decimal`.
 */
export interface ProfilPMSnapshotBrut extends Omit<
  ProfilPMSnapshot,
  'capitalSocial'
> {
  capitalSocial: number | string | null;
}

/**
 * Profil investisseur — personne morale.
 *
 * **Une façade**, comme `ProfilPP`, mais sur un seul bloc : `IdentiteLegale`
 * réunit raison sociale, forme juridique, SIREN et greffe, parce que ces
 * quatre champs décrivent une même chose — l'inscription au registre — et
 * partagent un invariant. Les quatre autres données déclarées (capital, siège,
 * secteur, représentant) restent à plat : ce sont des valeurs indépendantes
 * qu'aucune règle ne lie deux à deux, et les empaqueter produirait un bloc
 * nommé d'après rien. Un bloc se justifie par un invariant partagé.
 *
 * Naissance et reconstitution appartiennent à `ProfilPMFactory` et
 * `ProfilPMMapper`, qui passent par le constructeur `@internal`. Il reste donc
 * ici un seul chemin d'écriture, {@link mettreAJour}.
 *
 * Les attributs étaient publics et mutables, remplis par un
 * `Object.assign(profil, dto)` : n'importe quelle clé du DTO entrait dans le
 * domaine sans passer par une règle, et un SIREN de quatorze chiffres ou un
 * capital négatif atterrissaient tels quels en base.
 */
export class ProfilPM {
  private readonly _utilisateurId: number;
  private _identiteLegale: IdentiteLegale;
  private _capitalSocial: CapitalSocial | null;
  private _siegeAdresse: Libelle | null;
  private _secteurActivite: Libelle | null;
  private _representantId: number | null;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  /**
   * @internal Réservé à `ProfilPMFactory` et `ProfilPMMapper`.
   *
   * Public faute de mieux : TypeScript n'a pas de classe amie, et ces deux-là
   * — qui font respectivement naître et renaître un profil — doivent pouvoir
   * l'appeler. Il n'éprouve rien : passer par ici, c'est se déclarer fabrique
   * ou mapper, et prendre à sa charge les invariants que l'un pose et que
   * l'autre assume de ne pas rejouer.
   */
  constructor(etat: {
    entete: EnteteProfilPM;
    identiteLegale: IdentiteLegale;
    capitalSocial: CapitalSocial | null;
    siegeAdresse: Libelle | null;
    secteurActivite: Libelle | null;
    representantId: number | null;
  }) {
    this._utilisateurId = etat.entete.utilisateurId;
    this._createdAt = etat.entete.createdAt;
    this._updatedAt = etat.entete.updatedAt;
    this._identiteLegale = etat.identiteLegale;
    this._capitalSocial = etat.capitalSocial;
    this._siegeAdresse = etat.siegeAdresse;
    this._secteurActivite = etat.secteurActivite;
    this._representantId = etat.representantId;
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Met à jour les champs déclarés, aux mêmes conditions qu'à la création.
   *
   * Seules les clés **présentes** sont touchées : `undefined` signifie « ne pas
   * toucher », `null` « effacer ». Chacune repasse par son Value Object, donc
   * un SIREN corrigé est éprouvé exactement comme à la création.
   *
   * Le remplacement est **atomique** : tout est construit avant la moindre
   * affectation, donc un champ refusé laisse le profil dans l'état où il était.
   *
   * @returns `true` si au moins un champ a changé — utile à l'appelant qui veut
   *   éviter une écriture inutile ou tracer la modification.
   */
  mettreAJour(champs: ChampsDeclaresProfilPM): boolean {
    const identiteLegale = this._identiteLegale.avec(champs);
    const capitalSocial = siDeclare(
      champs.capitalSocial,
      (v) => CapitalSocial.of(v),
      this._capitalSocial,
    );
    const siegeAdresse = siDeclare(
      champs.siegeAdresse,
      eprouverSiegeAdresse,
      this._siegeAdresse,
    );
    const secteurActivite = siDeclare(
      champs.secteurActivite,
      eprouverSecteurActivite,
      this._secteurActivite,
    );
    const representantId = siDeclare(
      champs.representantId,
      eprouverRepresentantId,
      this._representantId,
    );

    const change =
      !this._identiteLegale.equals(identiteLegale) ||
      this._capitalSocial?.value !== capitalSocial?.value ||
      this._siegeAdresse?.value !== siegeAdresse?.value ||
      this._secteurActivite?.value !== secteurActivite?.value ||
      this._representantId !== representantId;

    this._identiteLegale = identiteLegale;
    this._capitalSocial = capitalSocial;
    this._siegeAdresse = siegeAdresse;
    this._secteurActivite = secteurActivite;
    this._representantId = representantId;

    return change;
  }

  // ── Règles propres au profil ──────────────────────────────────────────────

  /** @see IdentiteLegale.estImmatriculee */
  estImmatriculee(): boolean {
    return this._identiteLegale.estImmatriculee();
  }

  /**
   * Un représentant légal a-t-il été rattaché ?
   *
   * Il conditionne la signature électronique des bulletins de souscription :
   * une personne morale ne signe pas, c'est une personne physique qui signe
   * pour elle.
   */
  aUnRepresentant(): boolean {
    return this._representantId !== null;
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get utilisateurId(): number {
    return this._utilisateurId;
  }
  get identiteLegale(): IdentiteLegale {
    return this._identiteLegale;
  }
  get capitalSocial(): number | null {
    return this._capitalSocial?.value ?? null;
  }
  get siegeAdresse(): string | null {
    return this._siegeAdresse?.value ?? null;
  }
  get secteurActivite(): string | null {
    return this._secteurActivite?.value ?? null;
  }
  get representantId(): number | null {
    return this._representantId;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ── Sérialisation ─────────────────────────────────────────────────────────

  /**
   * Représentation exposable du profil.
   *
   * La mise en forme appartient à {@link ProfilPMMapper} ; seul le point
   * d'accroche reste ici, et il doit y rester : `res.json()` appelle
   * automatiquement `toJSON()`, ce qui protège aussi les chemins de
   * sérialisation indirects — un `ProfilPM` glissé dans une réponse sans appel
   * explicite, comme le fait `GET /users/me`. Sans cette méthode, il
   * ressortirait avec ses clés privées `_identiteLegale`, `_capitalSocial`…
   * Les clés publiées sont exactement celles d'avant : le front n'a rien à
   * changer.
   */
  toJSON(): ProfilPMSnapshot {
    return ProfilPMMapper.toSnapshot(this);
  }
}

// ── Règles des champs restés à plat ─────────────────────────────────────────
//
// Elles sont ici, et non recopiées dans la fabrique, parce que deux écrivains
// les appliquent désormais : `ProfilPMFactory.creer` et `mettreAJour`. Les
// laisser dans la fabrique aurait fait qu'une borne modifiée d'un côté ne
// l'était pas de l'autre — une adresse de 300 caractères refusée à la création
// mais acceptée à la mise à jour. Les champs groupés dans `IdentiteLegale`
// n'ont pas ce problème : leur bloc les porte déjà pour les deux chemins.

/** @internal Réservé à la fabrique et à `ProfilPM.mettreAJour`. */
export function eprouverSiegeAdresse(
  raw: string | null | undefined,
): Libelle | null {
  return Libelle.of(
    raw,
    "L'adresse du siège social",
    'siegeAdresse',
    MAX_SIEGE,
  );
}

/** @internal Réservé à la fabrique et à `ProfilPM.mettreAJour`. */
export function eprouverSecteurActivite(
  raw: string | null | undefined,
): Libelle | null {
  return Libelle.of(
    raw,
    "Le secteur d'activité",
    'secteurActivite',
    MAX_SECTEUR,
  );
}

/**
 * @internal Réservé à la fabrique et à `ProfilPM.mettreAJour`.
 *
 * `representantId` est une clé étrangère vers un compte : une valeur nulle ou
 * négative rattacherait le profil à personne, ou à quelqu'un d'autre.
 */
export function eprouverRepresentantId(
  raw: number | null | undefined,
): number | null {
  if (raw === null || raw === undefined) return null;
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new ChampProfilInvalideError(
      "L'identifiant du représentant légal",
      'doit être un entier positif.',
      'representantId',
    );
  }
  return raw;
}

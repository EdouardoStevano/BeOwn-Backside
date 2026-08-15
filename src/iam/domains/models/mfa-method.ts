import { MfaMethodType } from '../enums/mfa-method.enum';
import { MfaCredentialMismatchError } from '../errors/mfa.errors';

/** État complet du facteur, tel qu'il transite depuis la persistance. */
export interface MfaMethodSnapshot {
  id: number;
  method: MfaMethodType;
  isActive: boolean;
  credential: string;
}

/** Canaux dont la preuve est un code que le serveur expédie. */
const DELIVERING_CHANNELS: readonly MfaMethodType[] = [
  MfaMethodType.EMAIL,
  MfaMethodType.SMS,
];

/**
 * Facteur d'authentification enrôlé par un utilisateur, tous canaux confondus.
 *
 * Un seul modèle là où il y en avait deux — `TotpMethod` (secret chiffré) et
 * `ChannelTfaMethod` (destination du code). Ils ne différaient que par le nom
 * de leur unique champ variable, et cette différence se payait partout :
 * quatre entités ORM en héritage table unique, quatre repositories, deux
 * ports, deux tokens d'injection. `credential` unifie ce champ ; ce qu'il
 * contient se lit dans `method`.
 *
 * **Une classe et non une interface de données.** Sous sa forme précédente —
 * quatre champs publics et rien d'autre — le facteur ne savait rien de
 * lui-même : chaque appelant refaisait `m.isActive`, `!m.isActive`,
 * `m.credential === destination`, et surtout lisait `credential` sans savoir
 * ce qu'il contenait. Or ce champ porte, selon le canal, **une destination en
 * clair ou un secret partagé chiffré** : rien n'empêchait de publier un secret
 * TOTP là où on croyait afficher une adresse. Les accès sont désormais nommés
 * par ce qu'ils rendent, et refusent le canal qui ne les concerne pas.
 *
 * Ce que `credential` porte selon le canal :
 * - `totp` : le secret partagé, **chiffré** (`SecretCipher`) — jamais en clair,
 *   lisible uniquement par {@link encryptedSecret} ;
 * - `email` : l'adresse à laquelle le code est envoyé ;
 * - `sms` : le numéro E.164 auquel le code est envoyé.
 *
 * Immuable : les transitions d'état (activer, désactiver) passent par
 * `MfaMethodRepository`, qui travaille par identifiant. Exposer ici un
 * `activate()` qui ne persisterait rien laisserait croire le contraire.
 */
export class MfaMethod {
  private constructor(
    private readonly _id: number,
    private readonly _method: MfaMethodType,
    private readonly _isActive: boolean,
    private readonly _credential: string,
  ) {}

  /** Reconstruit un facteur depuis la persistance. */
  static rehydrate(snapshot: MfaMethodSnapshot): MfaMethod {
    return new MfaMethod(
      snapshot.id,
      snapshot.method,
      snapshot.isActive,
      snapshot.credential,
    );
  }

  get id(): number {
    return this._id;
  }

  get method(): MfaMethodType {
    return this._method;
  }

  /** Facteur confirmé, donc opposable à une connexion. */
  isActive(): boolean {
    return this._isActive;
  }

  /**
   * Enrôlement commencé et jamais confirmé. Le canal reste occupé jusqu'au
   * prochain enrôlement, mais un facteur en attente ne protège rien : il ne
   * doit ni être opposé à une connexion, ni compter comme second facteur.
   */
  isPending(): boolean {
    return !this._isActive;
  }

  /** Ce canal expédie-t-il un code ? `false` pour TOTP, qui le fait calculer. */
  deliversCode(): boolean {
    return DELIVERING_CHANNELS.includes(this._method);
  }

  /**
   * Ce facteur protège-t-il déjà cette destination ?
   *
   * Réunit les deux conditions qui n'ont de sens qu'ensemble : être actif, et
   * viser la même adresse ou le même numéro. Les dissocier laissait un
   * enrôlement en attente passer pour un facteur en place.
   */
  isActiveOn(destination: string): boolean {
    return this._isActive && this._credential === destination;
  }

  /**
   * Secret partagé **chiffré**, à confier à `SecretCipher`.
   *
   * Refuse tout autre canal : y lire un `credential` rendrait une adresse ou un
   * numéro là où l'appelant attend un secret, et le passerait au déchiffrement.
   */
  get encryptedSecret(): string {
    if (this._method !== MfaMethodType.TOTP) {
      throw new MfaCredentialMismatchError(this._method, 'un secret partagé');
    }
    return this._credential;
  }

  /**
   * Destination du code, **en clair** — pour l'expédier, jamais pour l'afficher.
   * Ce qu'on montre à l'utilisateur passe par {@link maskedDestination}.
   */
  get destination(): string {
    if (!this.deliversCode()) {
      throw new MfaCredentialMismatchError(this._method, 'une destination');
    }
    return this._credential;
  }

  /**
   * Destination tronquée, ou `undefined` sur un canal qui n'expédie rien.
   *
   * Elle doit permettre à son titulaire de reconnaître où le code est parti,
   * sans révéler l'adresse ou le numéro complet à qui n'a présenté qu'un mot de
   * passe. Le masque vit ici plutôt que dans chaque stratégie de canal : c'est
   * une règle sur ce qu'un facteur accepte de montrer de lui-même, et la garder
   * au bord laissait deux implémentations libres de diverger.
   */
  maskedDestination(): string | undefined {
    switch (this._method) {
      case MfaMethodType.EMAIL:
        return maskEmail(this._credential);
      case MfaMethodType.SMS:
        return maskPhone(this._credential);
      default:
        return undefined;
    }
  }
}

/** `jean.dupont@example.com` → `j***t@example.com`. */
const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
};

/** `+33612345678` → `+33*******78`. */
const maskPhone = (phone: string): string => {
  if (phone.length <= 5) return '***';
  return `${phone.slice(0, 3)}${'*'.repeat(phone.length - 5)}${phone.slice(-2)}`;
};

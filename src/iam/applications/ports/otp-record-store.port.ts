export const OTP_RECORD_STORE = Symbol('OTP_RECORD_STORE');

/**
 * Ce qui est gardé d'un OTP entre son envoi et sa saisie : le code, et le
 * nombre d'essais déjà consommés.
 *
 * Une donnée de transport, pas un modèle métier — le port la range et la rend,
 * il ne l'interprète jamais. Décider qu'un code est bon, qu'il reste des
 * essais ou qu'il faut le détruire appartient à `OtpService`.
 */
export interface OtpRecord {
  otp: string;
  attempts: number;
  /**
   * Échéance absolue, posée par `OtpService`. Elle voyage avec le record
   * parce que réécrire l'entrée après un essai manqué doit repartir sur le
   * temps qu'il restait, jamais sur une durée neuve — sinon enchaîner les
   * erreurs prolongerait la fenêtre aussi longtemps qu'on veut.
   */
  expiresAt: number;
}

/**
 * Rangement à durée de vie pour les OTP — **et rien d'autre**.
 *
 * Trois primitives, celles que tout magasin sait faire : ranger avec une
 * échéance, relire, effacer. C'est exactement la surface qui change si le
 * cache mémoire cède la place à Redis, DynamoDB ou une table SQL.
 *
 * Ce que ce port ne fait **plus** : tirer un code à six chiffres, compter les
 * essais, décider de la durée de validité, consommer l'entrée au premier
 * succès. Cette politique vivait dans l'adapter cache, si bien qu'un second
 * magasin l'aurait réécrite entièrement — avec ses propres bornes, ses propres
 * bugs, et l'obligation de corriger deux fois. Elle est remontée dans
 * `OtpService` (§4 — SRP, DIP), qui est le seul à en connaître les règles.
 */
export interface OtpRecordStore {
  /**
   * Range le record en écrasant l'éventuel précédent. `ttlMs` sert à l'éviction
   * du magasin lui-même ; l'échéance qui fait foi reste `record.expiresAt`,
   * que `OtpService` contrôle — un backend mémoire configuré autrement
   * rendrait sinon une entrée périmée.
   */
  save(key: string, record: OtpRecord, ttlMs: number): Promise<void>;
  /** Rend le record tel qu'il a été rangé, ou `null` s'il est inconnu. */
  find(key: string): Promise<OtpRecord | null>;
  /** Efface l'entrée. Ne rien trouver n'est pas une erreur. */
  delete(key: string): Promise<void>;
}

import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import {
  OTP_RECORD_STORE,
  type OtpRecord,
  type OtpRecordStore,
} from 'src/iam/applications/ports/otp-record-store.port';
import { TooManyOtpAttemptsError } from 'src/iam/domains/errors';

/**
 * Bornes du code à usage unique. Six chiffres : ce que valent les codes
 * envoyés par SMS et email partout ailleurs, et ce que les écrans de saisie
 * attendent.
 */
const OTP_MIN = 100_000;
const OTP_MAX = 1_000_000;

/** Durée de validité par défaut, en secondes — surchargeable par `OTP_TTL`. */
const DEFAULT_TTL_SECONDS = 30;

/** Essais accordés par défaut — surchargeable par `MAX_ATTEMPTS`. */
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Lit un entier d'environnement en refusant les valeurs inexploitables.
 *
 * `Number(undefined)` vaut `NaN`, et toute comparaison avec `NaN` est fausse :
 * la lecture directe de `process.env` qui précédait rendait donc le plafond
 * d'essais inopérant dès que la variable manquait. Le repli explicite ferme ce
 * cas.
 */
const readPositiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Politique des OTP à usage unique — tout ce qui reste vrai quel que soit le
 * magasin qui les range.
 *
 * Tirage du code, durée de validité, plafond d'essais, destruction au premier
 * succès : ces règles vivaient dans l'adapter cache. Elles n'ont rien de
 * technique, et les laisser là revenait à les redemander à chaque nouveau
 * magasin — trois méthodes de rangement auraient suffi, on en aurait réécrit
 * la politique entière. Le port ne garde donc que `save/find/delete`
 * ({@link OtpRecordStore}) et cette classe porte le reste.
 *
 * La surface publique est identique à celle de l'ancien port `OtpService` : les
 * stratégies et use cases qui l'appelaient n'ont pas changé d'un caractère,
 * seul leur point d'injection a bougé.
 */
@Injectable()
export class OtpService {
  private readonly ttlMs: number;
  private readonly maxAttempts: number;

  constructor(
    @Inject(OTP_RECORD_STORE) private readonly store: OtpRecordStore,
  ) {
    this.ttlMs =
      readPositiveInt(process.env.OTP_TTL, DEFAULT_TTL_SECONDS) * 1000;
    this.maxAttempts = readPositiveInt(
      process.env.MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
    );
  }

  /** Tire un code, le range sous cette clé, et le rend à l'appelant. */
  async generateOtp(key: string): Promise<string> {
    const otp = randomInt(OTP_MIN, OTP_MAX).toString();

    // Écrase un éventuel code en cours sur la même clé : deux codes vivants
    // pour une même destination doubleraient les essais accordés.
    await this.store.save(
      key,
      { otp, attempts: 0, expiresAt: Date.now() + this.ttlMs },
      this.ttlMs,
    );

    return otp;
  }

  /**
   * Éprouve le code. Un succès **consomme** l'entrée — un OTP ne sert qu'une
   * fois ; un échec décompte un essai, et le dernier détruit l'entrée.
   */
  async verifyOtp(key: string, otp: string): Promise<boolean> {
    const record = await this.read(key);
    if (!record) return false;

    if (record.attempts >= this.maxAttempts) {
      await this.store.delete(key);
      throw new TooManyOtpAttemptsError();
    }

    if (record.otp !== otp) {
      // Réécrit sur ce qu'il reste de validité, jamais sur une durée neuve :
      // enchaîner les erreurs prolongerait sinon la fenêtre à volonté.
      await this.store.save(
        key,
        { ...record, attempts: record.attempts + 1 },
        record.expiresAt - Date.now(),
      );
      return false;
    }

    await this.store.delete(key);
    return true;
  }

  /** Un code est-il déjà en attente de saisie sur cette clé ? */
  async hasActiveOtp(key: string): Promise<boolean> {
    return (await this.read(key)) !== null;
  }

  /** Retire le code : envoi échoué, ou abandon du parcours. */
  async invalidate(key: string): Promise<void> {
    await this.store.delete(key);
  }

  /**
   * Lecture avec contrôle d'échéance explicite : le TTL du magasin suffit en
   * principe, mais la date fait foi — c'est la politique, elle ne se délègue
   * pas au backend.
   */
  private async read(key: string): Promise<OtpRecord | null> {
    const record = await this.store.find(key);
    if (!record) return null;

    if (record.expiresAt <= Date.now()) {
      await this.store.delete(key);
      return null;
    }

    return record;
  }
}

import { TwoFactorMethod } from './enums/user.enum';

export class UserPreferences {
  userId: number;
  langue: string;
  masquerMontants: boolean;
  notifEmail: boolean;
  notifSms: boolean;
  notifMarketing: boolean;
  /**
   * Le canal de second facteur choisi, ou `null` si la 2FA est désactivée.
   *
   * Remplace l'ancien booléen `twoFactorEnabled` : « la 2FA est active » et
   * « par quel canal » étaient deux informations qu'un seul champ ne pouvait pas
   * porter, et un booléen ne peut pas exprimer qu'on ne choisit qu'une méthode.
   */
  twoFactorMethod: TwoFactorMethod | null;
  preferredCurrency: string;
  createdAt: Date;
  updatedAt: Date;

  get twoFactorEnabled(): boolean {
    return this.twoFactorMethod !== null;
  }

  /** Les getters ne sont pas sérialisés par JSON.stringify : on les rajoute ici. */
  toJSON() {
    return { ...this, twoFactorEnabled: this.twoFactorEnabled };
  }
}

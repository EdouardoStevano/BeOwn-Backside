export class UserPreferences {
  userId: number;
  langue: string;
  masquerMontants: boolean;
  notifEmail: boolean;
  notifSms: boolean;
  notifMarketing: boolean;
  twoFactorEnabled: boolean;
  preferredCurrency: string;
  createdAt: Date;
  updatedAt: Date;
}

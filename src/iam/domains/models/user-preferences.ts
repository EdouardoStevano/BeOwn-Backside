export class UserPreferences {
  userId: number;
  langue: string;
  masquerMontants: boolean;
  notifEmail: boolean;
  notifSms: boolean;
  notifMarketing: boolean;
  twoFactorEnabled: boolean;
  preferredCurrency: string;
  reinvestLoyers: boolean;
  reinvestProjetId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

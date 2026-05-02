export class UserEmail {
  email: string;
  isVerified: boolean;
  verifiedDate: Date | null;

  constructor(email: string) {
    this.email = email.toLowerCase().trim();
    this.isVerified = false;
    this.verifiedDate = null;
  }

  verify(): void {
    this.isVerified = true;
    this.verifiedDate = new Date();
  }
}

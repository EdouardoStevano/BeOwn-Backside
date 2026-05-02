export class UserEmail {
  private readonly _email: string;
  private _isVerified: boolean;
  private _verifiedDate: Date | null;

  private constructor(email: string, isVerified: boolean, verifiedDate: Date | null) {
    this._email = email;
    this._isVerified = isVerified;
    this._verifiedDate = verifiedDate;
  }

  static create(email: string): UserEmail {
    return new UserEmail(email.toLowerCase().trim(), false, null);
  }

  static reconstitute(email: string, isVerified: boolean, verifiedDate: Date | null): UserEmail {
    return new UserEmail(email, isVerified, verifiedDate);
  }

  get email(): string {
    return this._email;
  }

  get isVerified(): boolean {
    return this._isVerified;
  }

  get verifiedDate(): Date | null {
    return this._verifiedDate;
  }

  verify(): void {
    this._isVerified = true;
    this._verifiedDate = new Date();
  }
}
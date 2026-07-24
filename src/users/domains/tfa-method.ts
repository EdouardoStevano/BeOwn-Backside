export abstract class TfaMethod {
  tfaMethodId: number;
  isActive: boolean;
  activatedDate: Date;
}

export class SmsMethod extends TfaMethod {
  phoneNumberOtp: string;
}

export class EmailMethod extends TfaMethod {
  emailOtp: string;
}

export class TotpMethod extends TfaMethod {
  secretKeyOtp: string;
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verify } from 'otplib';
import {
  TotpGenerator,
  TotpSecret,
} from 'src/iam/applications/ports/totp-generator.port';

@Injectable()
export class OtplibTotpGeneratorAdapter implements TotpGenerator {
  constructor(private readonly configService: ConfigService) {}

  generateSecret(email: string): TotpSecret {
    const secret = generateSecret();
    const appName = this.configService.getOrThrow('TFA_APP_NAME');
    const uri = generateURI({ issuer: appName, label: email, secret });
    return { uri, secret };
  }

  async verify(otp: string, secret: string): Promise<boolean> {
    // `verify` est asynchrone et rend un objet `{ valid }` : les deux étaient
    // ignorés auparavant (cf. TotpGenerator).
    const result = await verify({ token: otp, secret });
    return result.valid;
  }
}

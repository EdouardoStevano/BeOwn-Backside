import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import {
  TotpGenerator,
  TotpUriParams,
} from 'src/iam/application/ports/totp-generator.port';

/**
 * Calcul RFC 6238 par otplib — et rien d'autre.
 *
 * Trois appels de bibliothèque. Le nom d'émetteur et l'assemblage du couple
 * `{ uri, secret }` rendu à l'enrôlement ont rejoint `TotpSecretService` : ils
 * ne dépendent pas d'otplib, les garder ici les aurait fait recopier par tout
 * générateur de remplacement.
 */
@Injectable()
export class OtplibTotpGeneratorAdapter implements TotpGenerator {
  generateSecret(): string {
    return generateSecret();
  }

  buildUri({ issuer, label, secret, image }: TotpUriParams): string {
    const uri = generateURI({ issuer, label, secret });

    // otplib s'en tient au Key Uri Format et n'expose aucun moyen d'ajouter un
    // paramètre : `image` étant une extension hors spec, il est concaténé ici.
    // `encodeURIComponent` est indispensable — une URL non échappée casserait
    // la chaîne de requête sur son propre `?` ou ses `&`.
    return image ? `${uri}&image=${encodeURIComponent(image)}` : uri;
  }

  async verify(otp: string, secret: string): Promise<boolean> {
    // `verify` est asynchrone et rend un objet `{ valid }` : les deux étaient
    // ignorés auparavant (cf. TotpGenerator).
    const result = await verify({ token: otp, secret });
    return result.valid;
  }
}

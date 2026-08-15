import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';

/** `POST /auth/mfa/enroll` — démarre l'enrôlement d'un facteur. */
export class EnrollMfaDto {
  @ApiProperty({
    enum: MfaMethodType,
    enumName: 'MfaMethodType',
    example: MfaMethodType.TOTP,
    description: 'Canal de double authentification à enrôler.',
  })
  @IsEnum(MfaMethodType)
  method: MfaMethodType;

  @ApiPropertyOptional({
    example: '+33612345678',
    description:
      "Destination du facteur. **Requis pour `sms`** (numéro E.164). Ignoré pour `totp` (aucune destination) et pour `email` : ce canal envoie toujours à l'adresse du compte, déjà vérifiée — accepter une adresse arbitraire permettrait de déplacer le second facteur vers une boîte tierce depuis une simple session valide.",
  })
  // Le format n'est exigé que sur le canal qui s'en sert : sur `totp` et
  // `email` la valeur est ignorée, la refuser n'apporterait rien.
  @ValidateIf((dto: EnrollMfaDto) => dto.method === MfaMethodType.SMS)
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'credential doit être au format E.164 (ex: +33612345678)',
  })
  credential?: string;
}

/**
 * Défi renvoyé par `POST /auth/mfa/enroll`. Les champs sont **mutuellement
 * exclusifs selon le canal** : `totp` remplit `secret` + `uri` (rien n'est
 * envoyé), `email`/`sms` remplissent `sentTo` (aucun secret n'est exposé).
 */
export class MfaEnrollmentChallengeDto {
  @ApiProperty({
    enum: MfaMethodType,
    enumName: 'MfaMethodType',
    description: 'Canal effectivement enrôlé.',
  })
  method: MfaMethodType;

  @ApiPropertyOptional({
    example: 'JBSWY3DPEHPK3PXP',
    description:
      'TOTP uniquement — secret partagé, pour la saisie manuelle dans une application authenticator.',
  })
  secret?: string;

  @ApiPropertyOptional({
    example: 'otpauth://totp/BeOwn:user@example.com?secret=JBSWY3DPEHPK3PXP',
    description: 'TOTP uniquement — URI `otpauth://` à encoder en QR code.',
  })
  uri?: string;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description:
      "Email/SMS uniquement — destination du code, en clair : elle appartient déjà à l'appelant, qui vient soit de la soumettre (`sms`), soit d'en être le titulaire vérifié (`email`).",
  })
  sentTo?: string;
}

/**
 * `POST /auth/mfa/enable` — active le facteur enrôlé.
 *
 * Pas de champ `method` : le canal est déduit de l'enrôlement en attente. Le
 * redemander serait redondant, l'appelant venant d'appeler `/auth/mfa/enroll`.
 */
export class EnableMfaDto {
  @ApiProperty({
    example: '123456',
    description:
      "Code TOTP lu dans l'application authenticator, ou code reçu par email/SMS lors de l'enrôlement.",
  })
  @IsString()
  code: string;
}

/**
 * Un facteur enrôlé, tel que le rend `GET /auth/mfa/methods`.
 *
 * Ni secret, ni destination en clair : le `credential` stocké porte le secret
 * TOTP chiffré pour ce canal, et une adresse ou un numéro pour les autres.
 * Seule une forme masquée sort d'ici.
 */
export class MfaMethodSummaryDto {
  @ApiProperty({
    enum: MfaMethodType,
    enumName: 'MfaMethodType',
    description: 'Canal du facteur.',
  })
  method: MfaMethodType;

  @ApiProperty({
    example: true,
    description:
      "`false` = enrôlement commencé et jamais confirmé. Le canal reste occupé jusqu'au prochain `POST /auth/mfa/enroll`, qui purge l'enrôlement en attente.",
  })
  isActive: boolean;

  @ApiPropertyOptional({
    example: 'j***n@example.com',
    description:
      "Destination **masquée** du code. Absente pour `totp`, qui n'envoie rien — le code est lu dans l'application de l'utilisateur.",
  })
  sentTo?: string;
}

/** Canal activé, renvoyé par `POST /auth/mfa/enable`. */
export class MfaMethodResponseDto {
  @ApiProperty({
    enum: MfaMethodType,
    enumName: 'MfaMethodType',
    description: 'Canal concerné par l’opération.',
  })
  method: MfaMethodType;
}

/**
 * Body de `POST /auth/sign-in/mfa/resend` — réexpédier le code de la connexion
 * en cours.
 *
 * Le seul champ est le défi lui-même : il porte déjà le compte et le canal.
 * C'est ce qui permet à la route d'être publique sans devenir un moyen
 * d'envoyer un code vers un compte tiers.
 */
export class ResendMfaChallengeDto {
  @ApiProperty({
    example: '3f2a7c1e-9b45-4f0d-8a2e-6c1b7d9e0a11',
    description:
      'Défi en cours, rendu par le 401 `MFA_REQUIRED` de `POST /auth/sign-in`. Il reste valable : le `challengeId` ne change pas.',
  })
  @IsString()
  challengeId: string;
}

/**
 * Défi émis, forme commune à `POST /auth/mfa/disable/challenge` et à
 * `POST /auth/sign-in/mfa/resend`.
 */
export class MfaChallengeIssuedDto {
  @ApiProperty({
    example: '3f2a7c1e-9b45-4f0d-8a2e-6c1b7d9e0a11',
    description: 'À renvoyer avec le code. Valable 5 minutes, 3 essais.',
  })
  challengeId: string;

  @ApiProperty({
    enum: MfaMethodType,
    enumName: 'MfaMethodType',
    description: 'Canal sur lequel la preuve est attendue.',
  })
  method: MfaMethodType;

  @ApiPropertyOptional({
    example: 'j***n@example.com',
    description: 'Destination **masquée** du code — absente pour `totp`.',
  })
  sentTo?: string;
}

/**
 * Body de `POST /auth/sign-in/mfa` — terminer la connexion avec le code.
 *
 * `challengeId` accompagne le code : la requête n'est pas authentifiée (c'est
 * justement la connexion qui n'est pas terminée), donc rien d'autre ne dit au
 * serveur quel compte ni quel canal sont en jeu.
 */
export class MfaChallengeDto {
  @ApiProperty({
    example: '3f2a7c1e-9b45-4f0d-8a2e-6c1b7d9e0a11',
    description:
      'Identifiant rendu par le 401 `MFA_REQUIRED` de `POST /auth/sign-in`.',
  })
  @IsString()
  challengeId: string;

  @ApiProperty({
    example: '123456',
    description: 'Code du facteur : TOTP, ou code reçu par email/SMS.',
  })
  @IsString()
  code: string;
}

/**
 * Corps du **401 `MFA_REQUIRED`** renvoyé par `POST /auth/sign-in` quand le mot
 * de passe est bon mais qu'un second facteur reste à éprouver.
 *
 * Une erreur plutôt qu'un 200 particulier : un 200 sur `/auth/sign-in` signifie
 * « session ouverte », sans exception à vérifier dans le corps.
 */
export class MfaRequiredErrorDto {
  @ApiProperty({ example: 401 })
  statusCode: number;

  @ApiProperty({ example: 'Unauthorized' })
  error: string;

  @ApiProperty({
    example: 'MFA_REQUIRED',
    description:
      "Code stable à tester par le front : c'est lui qui distingue « il manque une étape » d'un vrai échec d'identifiants (401 sans `code`).",
  })
  code: string;

  @ApiProperty({
    example:
      'Double authentification requise — terminez la connexion sur POST /auth/sign-in/mfa.',
  })
  message: string;

  @ApiProperty({
    example: '3f2a7c1e-9b45-4f0d-8a2e-6c1b7d9e0a11',
    description:
      'À renvoyer avec le code sur `POST /auth/sign-in/mfa`. Valable 5 minutes, 3 essais.',
  })
  challengeId: string;

  @ApiProperty({
    enum: MfaMethodType,
    enumName: 'MfaMethodType',
    description: 'Canal sur lequel la preuve est attendue.',
  })
  method: MfaMethodType;

  @ApiPropertyOptional({
    example: 'j***n@example.com',
    description:
      "Destination **masquée** du code — absente pour `totp`. Masquée parce qu'à ce stade seul le mot de passe a été fourni : la destination en clair renseignerait sur le compte.",
  })
  sentTo?: string;
}

/**
 * `POST /auth/mfa/disable/challenge` — premier temps du retrait : émet le défi
 * qu'il faudra relever.
 */
export class RequestDisableMfaDto {
  @ApiPropertyOptional({
    enum: MfaMethodType,
    enumName: 'MfaMethodType',
    description:
      "Canal à retirer. Par défaut, le facteur actif du compte — utile uniquement le jour où plusieurs canaux peuvent l'être en même temps.",
  })
  @IsOptional()
  @IsEnum(MfaMethodType)
  method?: MfaMethodType;
}

/**
 * `POST /auth/mfa/disable` — second temps : exécute le retrait.
 *
 * Les deux champs sont exigés. L'émission du défi a sa propre route
 * (`POST /auth/mfa/disable/challenge`) : une route dont le body décide de
 * l'effet obligeait l'appelant à connaître deux contrats sous une seule URL.
 */
export class DisableMfaDto {
  @ApiProperty({
    example: '3f2a7c1e-9b45-4f0d-8a2e-6c1b7d9e0a11',
    description: 'Défi rendu par `POST /auth/mfa/disable/challenge`.',
  })
  @IsString()
  challengeId: string;

  @ApiProperty({
    example: '123456',
    description:
      'Code du facteur retiré — la preuve qu’on le possède encore au moment de le rendre.',
  })
  @IsString()
  code: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';

/** `POST /auth/mfa/enroll` — démarre l'enrôlement d'un facteur. */
export class EnrollMfaDto {
  @ApiProperty({
    enum: TfaMethodType,
    enumName: 'TfaMethodType',
    example: TfaMethodType.TOTP,
    description: 'Canal de double authentification à enrôler.',
  })
  @IsEnum(TfaMethodType)
  method: TfaMethodType;

  @ApiPropertyOptional({
    example: '+33612345678',
    description:
      "Destination du facteur. **Requis pour `sms`** (numéro E.164). Ignoré pour `totp` (aucune destination) et pour `email` : ce canal envoie toujours à l'adresse du compte, déjà vérifiée — accepter une adresse arbitraire permettrait de déplacer le second facteur vers une boîte tierce depuis une simple session valide.",
  })
  // Le format n'est exigé que sur le canal qui s'en sert : sur `totp` et
  // `email` la valeur est ignorée, la refuser n'apporterait rien.
  @ValidateIf((dto: EnrollMfaDto) => dto.method === TfaMethodType.SMS)
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
    enum: TfaMethodType,
    enumName: 'TfaMethodType',
    description: 'Canal effectivement enrôlé.',
  })
  method: TfaMethodType;

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

/** Canal activé, renvoyé par `POST /auth/mfa/enable`. */
export class MfaMethodResponseDto {
  @ApiProperty({
    enum: TfaMethodType,
    enumName: 'TfaMethodType',
    description: 'Canal concerné par l’opération.',
  })
  method: TfaMethodType;
}

/**
 * `POST /auth/mfa/challenge` — second temps de la connexion.
 *
 * `challengeId` accompagne le code : la requête n'est pas authentifiée (c'est
 * justement la connexion qui n'est pas terminée), donc rien d'autre ne dit au
 * serveur quel compte ni quel canal sont en jeu.
 */
export class MfaChallengeDto {
  @ApiProperty({
    example: '3f2a7c1e-9b45-4f0d-8a2e-6c1b7d9e0a11',
    description: 'Identifiant rendu par `POST /auth/sign-in`.',
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
 * `POST /auth/mfa/disable` — retrait d'un facteur, en deux temps sur la même
 * route.
 *
 * Body vide (ou `method` seul) : émet le défi et rend un `challengeId`.
 * Body `{ challengeId, code }` : exécute le retrait.
 */
export class DisableMfaDto {
  @ApiPropertyOptional({
    example: '3f2a7c1e-9b45-4f0d-8a2e-6c1b7d9e0a11',
    description:
      'Identifiant rendu par le premier appel. Absent = premier appel, qui émet le défi.',
  })
  @IsOptional()
  @IsString()
  challengeId?: string;

  @ApiPropertyOptional({
    example: '123456',
    description:
      'Code du facteur retiré. Exigé dès lors que `challengeId` est fourni.',
  })
  // Le code n'a de sens qu'en présence du challenge qu'il relève.
  @ValidateIf((dto: DisableMfaDto) => dto.challengeId !== undefined)
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    enum: TfaMethodType,
    enumName: 'TfaMethodType',
    description:
      "Canal à retirer, au premier appel seulement. Par défaut, le facteur actif du compte — utile uniquement le jour où plusieurs canaux peuvent l'être en même temps.",
  })
  @IsOptional()
  @IsEnum(TfaMethodType)
  method?: TfaMethodType;
}

/** Défi renvoyé par le premier appel à `POST /auth/mfa/disable`. */
export class DisableMfaChallengeDto {
  @ApiProperty({
    example: '3f2a7c1e-9b45-4f0d-8a2e-6c1b7d9e0a11',
    description: 'À renvoyer avec le code pour exécuter le retrait.',
  })
  challengeId: string;

  @ApiProperty({
    enum: TfaMethodType,
    enumName: 'TfaMethodType',
    description: 'Canal dont la preuve est attendue.',
  })
  method: TfaMethodType;

  @ApiPropertyOptional({
    example: 'j***n@example.com',
    description:
      'Destination **masquée** du code — absente pour `totp`. Masquée et non en clair : à ce stade la destination n’a pas été resoumise par l’appelant, elle est lue en base.',
  })
  sentTo?: string;
}

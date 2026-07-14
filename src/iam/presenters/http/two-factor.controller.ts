import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import {
  ConfirmTwoFactorCommand,
  DisableTwoFactorCommand,
  EnrollTwoFactorCommand,
} from 'src/iam/application/two-factor/commands/two-factor.commands';
import {
  ConfirmTwoFactorDto,
  DisableTwoFactorDto,
  EnrollTwoFactorDto,
} from './dto/two-factor.dto';

/**
 * Activation et désactivation du second facteur. Toutes les routes sont
 * authentifiées : on configure sa 2FA depuis une session déjà ouverte, jamais
 * en cours de connexion.
 */
@ApiTags('Two-Factor Authentication')
@ApiBearerAuth()
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(private readonly commandBus: CommandBus) {}

  @ApiOperation({
    summary: 'Étape 1 — choisir un canal et recevoir un code de confirmation',
    description:
      'email/sms : un code part sur le canal. totp : la réponse porte le secret ' +
      'et son URI otpauth:// à afficher en QR code. Le canal reste inactif tant ' +
      "qu'il n'est pas confirmé — la connexion n'est donc jamais bloquée par un " +
      'enrôlement abandonné.',
  })
  @ApiResponse({
    status: 201,
    description: 'Canal enrôlé, en attente de confirmation',
  })
  @ApiResponse({ status: 400, description: 'Numéro requis (sms) ou invalide' })
  @Throttle({ auth: { ttl: 60_000, limit: 5 } })
  @Post('enroll')
  enroll(@CurrentUser() user: ActiveUser, @Body() dto: EnrollTwoFactorDto) {
    return this.commandBus.execute(
      new EnrollTwoFactorCommand(
        user.userId,
        user.email,
        dto.method,
        dto.phone,
      ),
    );
  }

  @ApiOperation({
    summary: 'Étape 2 — confirmer le code et activer le canal',
    description:
      "Activer un canal désactive le précédent : un compte n'a qu'une seule " +
      'méthode de double authentification à la fois.',
  })
  @ApiResponse({ status: 200, description: 'Double authentification activée' })
  @ApiResponse({
    status: 400,
    description: 'Code invalide, ou aucun enrôlement en cours',
  })
  @HttpCode(HttpStatus.OK)
  @Post('confirm')
  confirm(@CurrentUser() user: ActiveUser, @Body() dto: ConfirmTwoFactorDto) {
    return this.commandBus.execute(
      new ConfirmTwoFactorCommand(user.userId, user.email, dto.method, dto.otp),
    );
  }

  @ApiOperation({ summary: 'Désactiver la double authentification' })
  @ApiResponse({
    status: 204,
    description: 'Double authentification désactivée',
  })
  @ApiResponse({ status: 401, description: 'Mot de passe incorrect' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('disable')
  disable(@CurrentUser() user: ActiveUser, @Body() dto: DisableTwoFactorDto) {
    return this.commandBus.execute(
      new DisableTwoFactorCommand(user.userId, user.email, dto.password),
    );
  }
}

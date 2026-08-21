import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { GetPreferencesUseCase } from 'src/preferences/applications/usecases/get-preferences.usecase';
import { UpdatePreferencesUseCase } from 'src/preferences/applications/usecases/update-preferences.usecase';
import {
  LangueValueDto,
  ToggleValueDto,
  UpdatePreferencesDto,
} from './dto/preferences.dto';

/**
 * Réglages du titulaire.
 *
 * **Les chemins ne changent pas** : ils restent sous `/users/me/preferences`,
 * parce qu'ils sont déployés côté front. Seul le contrôleur qui les sert
 * change de contexte — `UserController` en portait sept, sur un sujet qui n'a
 * rien à voir avec l'identité ni l'authentification.
 *
 * Les cinq routes unitaires sont conservées telles quelles et retombent toutes
 * sur le même use case : elles ne se distinguent que par le champ qu'elles
 * touchent. Elles pourront disparaître au profit de la route groupée quand le
 * front n'appellera plus qu'elle.
 */
@ApiTags('Préférences')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(
    private readonly getPreferences: GetPreferencesUseCase,
    private readonly updatePreferences: UpdatePreferencesUseCase,
  ) {}

  @ApiOperation({ summary: 'Lire mes préférences' })
  @ApiResponse({ status: 200, description: 'Préférences utilisateur' })
  @Get('me/preferences')
  getMyPreferences(@CurrentUser() user: ActiveUser) {
    return this.getPreferences.execute(user.userId);
  }

  @ApiOperation({ summary: 'Mettre à jour mes préférences (bulk)' })
  @ApiResponse({ status: 200, description: 'Préférences mises à jour' })
  @ApiResponse({
    status: 409,
    description:
      'twoFactorEnabled ne se règle pas ici — voir /auth/mfa/enroll et /auth/mfa/disable',
  })
  @Patch('me/preferences')
  updateMyPreferences(
    @CurrentUser() user: ActiveUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.updatePreferences.execute(user.userId, dto);
  }

  @ApiOperation({ summary: 'Changer la langue' })
  @Patch('me/preferences/langue')
  updateLangue(@CurrentUser() user: ActiveUser, @Body() body: LangueValueDto) {
    return this.updatePreferences.execute(user.userId, {
      langue: body.value,
    });
  }

  @ApiOperation({ summary: 'Basculer le masquage des montants sensibles' })
  @Patch('me/preferences/masquer-montants')
  toggleMasquerMontants(
    @CurrentUser() user: ActiveUser,
    @Body() body: ToggleValueDto,
  ) {
    return this.updatePreferences.execute(user.userId, {
      masquerMontants: body.value,
    });
  }

  @ApiOperation({ summary: 'Basculer les notifications email' })
  @Patch('me/preferences/notif-email')
  toggleNotifEmail(
    @CurrentUser() user: ActiveUser,
    @Body() body: ToggleValueDto,
  ) {
    return this.updatePreferences.execute(user.userId, {
      notifEmail: body.value,
    });
  }

  @ApiOperation({ summary: 'Basculer les notifications SMS' })
  @Patch('me/preferences/notif-sms')
  toggleNotifSms(
    @CurrentUser() user: ActiveUser,
    @Body() body: ToggleValueDto,
  ) {
    return this.updatePreferences.execute(user.userId, {
      notifSms: body.value,
    });
  }

  @ApiOperation({ summary: 'Basculer les emails marketing' })
  @Patch('me/preferences/notif-marketing')
  toggleNotifMarketing(
    @CurrentUser() user: ActiveUser,
    @Body() body: ToggleValueDto,
  ) {
    return this.updatePreferences.execute(user.userId, {
      notifMarketing: body.value,
    });
  }

  @ApiOperation({
    summary: 'Double authentification — lecture seule depuis les préférences',
    description:
      "Répond 409 : armer un facteur exige d'en vérifier un code, le retirer " +
      "exige de prouver qu'on le possède encore. Aucune des deux garanties ne " +
      'tient dans un PATCH de préférence. Utilisez POST /auth/mfa/enroll et ' +
      'POST /auth/mfa/disable.',
  })
  @ApiResponse({
    status: 409,
    description: 'MFA_NON_MODIFIABLE_PAR_PREFERENCE',
  })
  // Deux chemins pour un seul handler : `mfa` est le nom retenu, `tfa` reste
  // servi parce que le front déployé l'appelle.
  @Patch(['me/preferences/mfa', 'me/preferences/tfa'])
  toggleMfa(@CurrentUser() user: ActiveUser, @Body() body: ToggleValueDto) {
    // Passe par le domaine plutôt que de lever ici : la règle vaut pour tout
    // appelant, y compris la route groupée (§12.5).
    return this.updatePreferences.execute(user.userId, {
      twoFactorEnabled: body.value,
    });
  }
}

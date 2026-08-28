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
import { GetPreferencesUseCase } from 'src/iam/application/usecases/preferences/get-preferences.usecase';
import { UpdatePreferencesUseCase } from 'src/iam/application/usecases/preferences/update-preferences.usecase';
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
 *
 * **La double authentification n'est pas un réglage** et n'a donc aucune route
 * ici : elle se pilote par `/auth/mfa/*`. `twoFactorEnabled` reste publié en
 * lecture, comme reflet des facteurs réellement enrôlés.
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

  // `PATCH me/preferences/mfa` et son alias `…/tfa` ont été retirés.
  //
  // Ils ne servaient qu'à répondre 409 en renvoyant vers `/auth/mfa/*` — une
  // route dont le seul rôle était d'expliquer qu'elle n'existait pas. Le
  // parcours complet vit dans `AuthenticationController` : `mfa/enroll`,
  // `mfa/enable`, `mfa/disable/challenge`, `mfa/disable`, et ces quatre-là
  // portent les garanties qu'un PATCH de préférence ne peut pas tenir —
  // vérifier un code pour armer un facteur, prouver qu'on le possède encore
  // pour le retirer.
  //
  // **La règle, elle, reste** : `Preferences.modifier` refuse toujours
  // `twoFactorEnabled`, ce qui protège la route groupée ci-dessus. C'est là
  // qu'elle doit être — dans le domaine, valable pour tout appelant, et non
  // dans un chemin HTTP qu'il suffisait de ne pas monter (§12.5).
}

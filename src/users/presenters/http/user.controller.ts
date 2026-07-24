import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import {
  DeleteAccountDto,
  RegisterDto,
  SetUserTypeDto,
  TogglePreferenceDto,
  UpdateLanguePreferenceDto,
  UpdatePreferencesDto,
  UpdateUserAdminDto,
  UpdateUserDto,
} from '../dto/user.dto';
import { RegisterCommand } from 'src/users/applications/commands/register.command';
import { UpdateProfileCommand } from 'src/users/applications/commands/update-profile.command';
import { UpdateUserByAdminCommand } from 'src/users/applications/commands/update-user-by-admin.command';
import { SetUserTypeCommand } from 'src/users/applications/commands/set-user-type.command';
import { DeleteAccountCommand } from 'src/users/applications/commands/delete-account.command';
import { UpdatePreferencesCommand } from 'src/users/applications/commands/update-preferences.command';
import { GetMyProfileQuery } from 'src/users/applications/queries/get-my-profile.query';
import { GetUserByIdQuery } from 'src/users/applications/queries/get-user-by-id.query';
import { GetPreferencesQuery } from 'src/users/applications/queries/get-preferences.query';

/**
 * Frontière HTTP du contexte Users : traduit une requête en commande ou en
 * query, et rien d'autre. Aucune règle métier, aucun accès au repository.
 */
@SkipThrottle()
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: 'Créer un nouveau compte utilisateur' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @Post()
  register(@Body() dto: RegisterDto) {
    return this.commandBus.execute(
      new RegisterCommand(
        dto.firstname,
        dto.lastname ?? null,
        dto.email,
        dto.password,
      ),
    );
  }

  @ApiOperation({ summary: 'Mon profil complet' })
  @ApiResponse({ status: 200, description: 'Profil complet retourné' })
  @Get('me')
  getMe(@CurrentUser() user: ActiveUser) {
    return this.queryBus.execute(new GetMyProfileQuery(user.userId));
  }

  @ApiOperation({ summary: 'Mettre à jour mon profil' })
  @ApiResponse({ status: 200, description: 'Profil mis à jour' })
  @Patch('me')
  updateMe(@CurrentUser() user: ActiveUser, @Body() dto: UpdateUserDto) {
    return this.commandBus.execute(
      new UpdateProfileCommand(user.userId, dto.firstname, dto.lastname),
    );
  }

  @ApiOperation({ summary: 'Lire mes préférences' })
  @ApiResponse({ status: 200, description: 'Préférences utilisateur' })
  @Get('me/preferences')
  getMyPreferences(@CurrentUser() user: ActiveUser) {
    return this.queryBus.execute(new GetPreferencesQuery(user.userId));
  }

  @ApiOperation({ summary: 'Mettre à jour mes préférences (bulk)' })
  @ApiResponse({ status: 200, description: 'Préférences mises à jour' })
  @Patch('me/preferences')
  updateMyPreferences(
    @CurrentUser() user: ActiveUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.commandBus.execute(
      new UpdatePreferencesCommand(user.userId, dto),
    );
  }

  @ApiOperation({ summary: 'Changer la langue' })
  @ApiResponse({ status: 200, description: 'Langue mise à jour' })
  @Patch('me/preferences/langue')
  updateLangue(
    @CurrentUser() user: ActiveUser,
    @Body() dto: UpdateLanguePreferenceDto,
  ) {
    return this.commandBus.execute(
      new UpdatePreferencesCommand(user.userId, { langue: dto.value }),
    );
  }

  @ApiOperation({ summary: 'Basculer le masquage des montants sensibles' })
  @ApiResponse({ status: 200, description: 'Préférence mise à jour' })
  @Patch('me/preferences/masquer-montants')
  toggleMasquerMontants(
    @CurrentUser() user: ActiveUser,
    @Body() dto: TogglePreferenceDto,
  ) {
    return this.commandBus.execute(
      new UpdatePreferencesCommand(user.userId, {
        masquerMontants: dto.value,
      }),
    );
  }

  @ApiOperation({ summary: 'Basculer les notifications email' })
  @ApiResponse({ status: 200, description: 'Préférence mise à jour' })
  @Patch('me/preferences/notif-email')
  toggleNotifEmail(
    @CurrentUser() user: ActiveUser,
    @Body() dto: TogglePreferenceDto,
  ) {
    return this.commandBus.execute(
      new UpdatePreferencesCommand(user.userId, { notifEmail: dto.value }),
    );
  }

  @ApiOperation({ summary: 'Basculer les notifications SMS' })
  @ApiResponse({ status: 200, description: 'Préférence mise à jour' })
  @Patch('me/preferences/notif-sms')
  toggleNotifSms(
    @CurrentUser() user: ActiveUser,
    @Body() dto: TogglePreferenceDto,
  ) {
    return this.commandBus.execute(
      new UpdatePreferencesCommand(user.userId, { notifSms: dto.value }),
    );
  }

  @ApiOperation({ summary: 'Basculer les emails marketing' })
  @ApiResponse({ status: 200, description: 'Préférence mise à jour' })
  @Patch('me/preferences/notif-marketing')
  toggleNotifMarketing(
    @CurrentUser() user: ActiveUser,
    @Body() dto: TogglePreferenceDto,
  ) {
    return this.commandBus.execute(
      new UpdatePreferencesCommand(user.userId, {
        notifMarketing: dto.value,
      }),
    );
  }

  // La double authentification n'est plus une préférence qu'on bascule : le
  // canal (email, SMS ou TOTP) doit être confirmé avant d'être activé, sans quoi
  // on peut se verrouiller hors de son compte. Cf. POST /auth/2fa/enroll.

  @ApiOperation({ summary: "Définir le type d'investisseur (PP ou PM)" })
  @ApiResponse({ status: 200, description: 'Type mis à jour' })
  @Patch('me/type')
  setUserType(@CurrentUser() user: ActiveUser, @Body() dto: SetUserTypeDto) {
    return this.commandBus.execute(
      new SetUserTypeCommand(user.userId, dto.userType),
    );
  }

  @ApiOperation({
    summary: 'Obtenir un utilisateur par ID (soi-même ou admin)',
  })
  @ApiParam({ name: 'id', description: "ID numérique de l'utilisateur" })
  @ApiResponse({
    status: 200,
    description: 'Utilisateur + KYC + wallet retournés',
  })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    return this.queryBus.execute(new GetUserByIdQuery(currentUser.userId, id));
  }

  @ApiOperation({ summary: 'Mettre à jour un utilisateur (admin seulement)' })
  @ApiParam({ name: 'id', description: "ID numérique de l'utilisateur cible" })
  @ApiResponse({ status: 200, description: 'Utilisateur mis à jour' })
  @ApiResponse({ status: 403, description: 'Accès refusé — rôle admin requis' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  @RequirePermission('users:manage')
  @Patch(':id')
  updateById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: ActiveUser,
    @Body() dto: UpdateUserAdminDto,
  ) {
    return this.commandBus.execute(
      new UpdateUserByAdminCommand(
        currentUser.userId,
        id,
        dto.firstname,
        dto.lastname,
        dto.role,
        dto.status,
      ),
    );
  }

  @ApiOperation({
    summary:
      'Supprimer mon compte (soft-delete après confirmation de mot de passe)',
  })
  @ApiResponse({ status: 204, description: 'Compte supprimé' })
  @ApiResponse({ status: 401, description: 'Mot de passe incorrect (code INVALID_PASSWORD)' })
  @ApiResponse({ status: 409, description: 'Suppression bloquée (ACCOUNT_DELETION_BLOCKED)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me')
  deleteMe(@CurrentUser() user: ActiveUser, @Body() dto: DeleteAccountDto) {
    return this.commandBus.execute(
      new DeleteAccountCommand(user.userId, dto.password),
    );
  }
}

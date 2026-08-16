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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { DeleteMyAccountUseCase } from 'src/iam/applications/usecases/account/delete-my-account.usecase';
import { GetMyAccountUseCase } from 'src/iam/applications/usecases/account/get-my-account.usecase';
import { GetUserAccountUseCase } from 'src/iam/applications/usecases/account/get-user-account.usecase';
import {
  DeclareUserTypeUseCase,
  UpdateMyAccountUseCase,
} from 'src/iam/applications/usecases/account/update-my-account.usecase';
import { UpdateUserByAdminUseCase } from 'src/iam/applications/usecases/account/update-user-by-admin.usecase';
import {
  SetUserTypeDto,
  UpdateUserAdminDto,
  UpdateUserDto,
} from 'src/iam/presenters/http/dto/user.dto';

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  password: string;
}

/**
 * Le compte, vu par son titulaire et par l'administration.
 *
 * **Ce contrôleur ne connaît plus que des use cases.** Il se faisait injecter
 * six repositories — dont ceux des contextes Profiles, Documents et Wallets —
 * plus le service de hachage et celui des notifications : la présentation
 * dialoguait directement avec des adapters de sortie appartenant à d'autres
 * modules, alors que ces deux couches sont parallèles et ne communiquent que
 * par `application/` (§2, §12.9). Les règles qui vivaient ici — qui a le droit
 * de lire quel compte, ce qu'est un profil complet, comment on confirme une
 * suppression — sont parties avec.
 *
 * Ce qui reste est le métier d'un contrôleur : valider le DTO, appeler le use
 * case, rendre la réponse (§12.5).
 *
 * Les préférences ont quitté ce fichier pour le contexte Preferences ; leurs
 * routes, elles, n'ont pas changé d'URL.
 */
@SkipThrottle()
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly getMyAccount: GetMyAccountUseCase,
    private readonly getUserAccount: GetUserAccountUseCase,
    private readonly updateMyAccount: UpdateMyAccountUseCase,
    private readonly declareUserType: DeclareUserTypeUseCase,
    private readonly updateUserByAdmin: UpdateUserByAdminUseCase,
    private readonly deleteMyAccount: DeleteMyAccountUseCase,
  ) {}

  // L'inscription vit dans IAM : `POST /auth/sign-up` (reCAPTCHA + throttle
  // 10/15 min). Le `POST /users` qui existait ici appelait le même usecase mais
  // depuis un contrôleur `@SkipThrottle()` et sans captcha — doublon supprimé.

  @ApiOperation({ summary: 'Mon profil complet' })
  @ApiResponse({ status: 200, description: 'Profil complet retourné' })
  @Get('me')
  getMe(@CurrentUser() user: ActiveUser) {
    return this.getMyAccount.execute(user.userId);
  }

  @ApiOperation({ summary: 'Mettre à jour mon profil' })
  @ApiResponse({ status: 200, description: 'Profil mis à jour' })
  @Patch('me')
  async updateMe(@CurrentUser() user: ActiveUser, @Body() dto: UpdateUserDto) {
    const compte = await this.updateMyAccount.execute(user.userId, dto);
    return compte.toJSON();
  }

  @ApiOperation({ summary: "Définir le type d'investisseur (PP ou PM)" })
  @ApiResponse({ status: 200, description: 'Type mis à jour' })
  @Patch('me/type')
  async setUserType(
    @CurrentUser() user: ActiveUser,
    @Body() dto: SetUserTypeDto,
  ) {
    const compte = await this.declareUserType.execute(
      user.userId,
      dto.userType,
    );
    return compte.toJSON();
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
    return this.getUserAccount.execute(id, currentUser.userId);
  }

  @ApiOperation({ summary: 'Mettre à jour un utilisateur (admin seulement)' })
  @ApiParam({ name: 'id', description: "ID numérique de l'utilisateur cible" })
  @ApiResponse({ status: 200, description: 'Utilisateur mis à jour' })
  @ApiResponse({ status: 403, description: 'Accès refusé — rôle admin requis' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  @RequirePermission('users:manage')
  @Patch(':id')
  async updateById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: ActiveUser,
    @Body() dto: UpdateUserAdminDto,
  ) {
    const compte = await this.updateUserByAdmin.execute(
      id,
      dto,
      currentUser.userId,
    );
    return compte.toJSON();
  }

  @ApiOperation({
    summary:
      'Supprimer mon compte (soft-delete après confirmation de mot de passe et levée des bloqueurs)',
  })
  @ApiResponse({ status: 204, description: 'Compte supprimé' })
  @ApiResponse({
    status: 401,
    description: 'Mot de passe incorrect (code INVALID_PASSWORD)',
  })
  @ApiResponse({
    status: 409,
    description: 'Suppression bloquée (ACCOUNT_DELETION_BLOCKED)',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me')
  async deleteMe(
    @CurrentUser() user: ActiveUser,
    @Body() dto: DeleteAccountDto,
  ) {
    await this.deleteMyAccount.execute(user.userId, dto.password);
  }
}

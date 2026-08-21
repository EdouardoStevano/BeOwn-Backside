import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { GetMyAccountUseCase } from 'src/iam/application/usecases/account-overview/get-my-account.usecase';
import { GetUserAccountUseCase } from 'src/iam/application/usecases/account-overview/get-user-account.usecase';

/**
 * Les deux **lectures composées** du compte : la vue d'ensemble du titulaire et
 * la consultation d'un compte, par soi-même ou par le back-office.
 *
 * Elles vivaient dans `UserController` (IAM) et gardent leurs URL —
 * `GET /users/me` et `GET /users/:id` n'ont pas bougé, le front n'a rien à
 * changer. Seul le module qui les sert a changé, pour que la lecture qui
 * traverse cinq contextes ne soit plus servie par le contexte dont les quatre
 * autres dépendent.
 *
 * Les deux routes restent **dans le même contrôleur** : `me` doit être déclarée
 * avant `:id`, sans quoi `ParseIntPipe` rejetterait « me » en 400. Les séparer
 * ferait dépendre l'ordre de résolution de l'ordre d'enregistrement des
 * modules — un couplage invisible et fragile.
 */
@SkipThrottle()
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class AccountOverviewController {
  constructor(
    private readonly getMyAccount: GetMyAccountUseCase,
    private readonly getUserAccount: GetUserAccountUseCase,
  ) {}

  @ApiOperation({ summary: 'Mon profil complet' })
  @ApiResponse({ status: 200, description: 'Profil complet retourné' })
  @Get('me')
  getMe(@CurrentUser() user: ActiveUser) {
    return this.getMyAccount.execute(user.userId);
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
}

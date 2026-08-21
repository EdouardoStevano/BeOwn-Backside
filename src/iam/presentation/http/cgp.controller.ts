import { Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { Roles } from 'src/iam/presentation/decorators/roles.decorator';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { ConsulterPortefeuilleCgpUseCase } from 'src/iam/application/usecases/cgp/consulter-portefeuille-cgp.usecase';
import { PublierCodeParrainageUseCase } from 'src/iam/application/usecases/cgp/publier-code-parrainage.usecase';
import { RattacherAUnCgpUseCase } from 'src/iam/application/usecases/cgp/rattacher-a-un-cgp.usecase';

/**
 * Conseillers en gestion de patrimoine : leur code de parrainage, leurs
 * clients, le poids de leur portefeuille.
 *
 * Le contrôleur injectait `Repository<UserEntity>` et
 * `Repository<InvestmentEntity>` — deux tables, dont celle d'un autre Bounded
 * Context, atteintes directement depuis un adapter d'entrée. Il portait aussi
 * la garde de rôle (une méthode privée `requireCgp`), la composition du code de
 * parrainage, la règle du rattachement unique et le calcul de l'encours. Tout
 * cela est parti dans le domaine et dans les use cases ; il ne reste ici que le
 * routage, et la garde de rôle rendue à `@Roles` — le guard qui existait déjà
 * pour ça (§5, la présentation ne décide de rien).
 */
@ApiTags('CGP / Distributeurs')
@ApiBearerAuth()
@Controller('cgp')
export class CgpController {
  constructor(
    private readonly portefeuille: ConsulterPortefeuilleCgpUseCase,
    private readonly publierCode: PublierCodeParrainageUseCase,
    private readonly rattacher: RattacherAUnCgpUseCase,
  ) {}

  @ApiOperation({
    summary: 'Mes statistiques CGP (AUM, nb clients, commissions estimées)',
  })
  @Roles(UserRole.CGP)
  @Get('me/stats')
  getMyStats(@CurrentUser() user: ActiveUser) {
    return this.portefeuille.stats(user.userId);
  }

  @ApiOperation({ summary: 'Liste de mes clients avec leurs investissements' })
  @Roles(UserRole.CGP)
  @Get('me/clients')
  getMyClients(@CurrentUser() user: ActiveUser) {
    return this.portefeuille.clients(user.userId);
  }

  @ApiOperation({ summary: 'Générer ou régénérer mon code de parrainage CGP' })
  @Roles(UserRole.CGP)
  @Patch('me/referral-code')
  generateReferralCode(@CurrentUser() user: ActiveUser) {
    return this.publierCode.execute(user.userId);
  }

  /**
   * Le conseiller rattache un client à lui-même.
   *
   * ⚠️ Changement de comportement assumé : la route acceptait aussi
   * `SUPER_ADMIN`, pour qui elle ne faisait **rien** — le corps se réduisait à
   * `client.cgpId = client.cgpId`, faute d'un conseiller cible dans la requête,
   * et rendait quand même `{ linked: true }`. Un administrateur reçoit
   * désormais un 403 plutôt qu'un succès mensonger. Rattacher un client au nom
   * d'un tiers demanderait de désigner ce tiers, donc une autre route.
   */
  @ApiOperation({ summary: 'Lier un client à ce CGP via son userId' })
  @Roles(UserRole.CGP)
  @Patch('clients/:clientId/link')
  linkClient(
    @Param('clientId', ParseIntPipe) clientId: number,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.rattacher.parDesignation(clientId, user.userId);
  }

  @ApiOperation({ summary: 'Rejoindre un CGP via son code de parrainage' })
  @Patch('join/:referralCode')
  joinViaCgpCode(
    @Param('referralCode') referralCode: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.rattacher.parCode(user.userId, referralCode);
  }
}

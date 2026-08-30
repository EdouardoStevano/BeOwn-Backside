import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { ListerProfilsInvestisseurUseCase } from '../../application/usecases/investisseur/lister-profils-investisseur.usecase';
import { BasculerProfilInvestisseurUseCase } from '../../application/usecases/investisseur/basculer-profil-investisseur.usecase';

export class BasculerProfilDto {
  @ApiPropertyOptional({
    description:
      'UUID de la société vers laquelle basculer. Omis ou `null` pour ' +
      'revenir à son nom propre — repli toujours disponible.',
  })
  @IsOptional()
  @IsUUID()
  societeId?: string | null;
}

/**
 * Au nom de qui ce compte agit : lui-même, ou l'une de ses sociétés.
 *
 * Le cahier des charges veut qu'un titulaire puisse *« investir via les
 * entreprises dont il est le représentant légal sans avoir besoin de se créer
 * plusieurs comptes »*. Il porte donc plusieurs identités — son dossier
 * personne physique et ses sociétés — et ces routes disent laquelle est active,
 * quelles sont les autres, et ce que chacune permet.
 *
 * `GET /profiles/investisseur` rend tout ce qu'il faut à un sélecteur : le
 * libellé, le drapeau actif, et **l'aptitude avec son motif**. Griser une
 * société sans dire pourquoi renverrait le titulaire à deviner s'il lui manque
 * un KBIS, un bénéficiaire, ou sa propre vérification d'identité.
 *
 * > ⚠️ **Ce choix gouverne l'affichage, pas la souscription.** `Investment` et
 * > `Reservation` sont clés sur le compte, pas sur le profil : une souscription
 * > passée après une bascule reste enregistrée au nom du titulaire. Ces routes
 * > sont donc sous `/profiles`, dans le contexte conformité, et aucune route
 * > financière ne les lit — le faire donnerait une autorité que rien ne vérifie
 * > en aval. La seconde moitié est le `SouscripteurId` porté par la
 * > souscription elle-même.
 */
@ApiTags('Conformité — Profil investisseur actif')
@ApiBearerAuth()
@Controller('profiles/investisseur')
@UseGuards(JwtAuthGuard)
export class ProfilInvestisseurController {
  constructor(
    private readonly listerProfils: ListerProfilsInvestisseurUseCase,
    private readonly basculerProfil: BasculerProfilInvestisseurUseCase,
  ) {}

  @ApiOperation({
    summary: 'Les profils entre lesquels je peux basculer',
    description:
      'Mon nom propre et chacune de mes sociétés, avec le profil actif et ' +
      'ce qui manque à chacun pour être en état d’opérer.',
  })
  @ApiResponse({ status: 200, description: 'Profils disponibles' })
  @Get()
  lister(@CurrentUser() user: ActiveUser) {
    return this.listerProfils.execute(user.userId);
  }

  @ApiOperation({
    summary: 'Le profil au nom duquel j’agis actuellement',
    description:
      'Repli sur le nom propre tant qu’aucune bascule n’a eu lieu : agir ' +
      'pour soi n’engage que soi.',
  })
  @ApiResponse({ status: 200, description: 'Profil actif' })
  @Get('actif')
  async actif(@CurrentUser() user: ActiveUser) {
    const profil = await this.listerProfils.actif(user.userId);
    return profil.toSnapshot();
  }

  @ApiOperation({
    summary: 'Basculer vers une de mes sociétés, ou revenir à mon nom propre',
    description:
      'Basculer vers une société au dossier incomplet est permis — c’est en ' +
      'étant dessus qu’on dépose ses justificatifs. Ce sont les opérations ' +
      'financières qui refusent, pas le sélecteur.',
  })
  @ApiResponse({ status: 201, description: 'Profils, avec le nouvel actif' })
  @ApiResponse({ status: 404, description: 'Société introuvable' })
  @Post('actif')
  basculer(@CurrentUser() user: ActiveUser, @Body() dto: BasculerProfilDto) {
    return this.basculerProfil.execute(user.userId, dto.societeId ?? null);
  }
}

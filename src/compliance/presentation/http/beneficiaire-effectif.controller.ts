import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { BeneficiaireEffectifEntity } from '../../infrastructure/persistence/entities/beneficiaire-effectif.entity';
import { GetProfilPMUseCase } from '../../application/usecases/profiles/get-profil-pm.usecase';
import { CreateBeneficiaireEffectifDto } from './dto/beneficiaire-effectif.dto';

@ApiTags('Profiles — Bénéficiaires Effectifs (DBE-S1)')
@ApiBearerAuth()
@Controller('profiles/pm/me/beneficiaires')
@UseGuards(JwtAuthGuard)
export class BeneficiaireEffectifController {
  constructor(
    @InjectRepository(BeneficiaireEffectifEntity)
    private readonly beneficiaireRepo: Repository<BeneficiaireEffectifEntity>,
    private readonly getProfilPM: GetProfilPMUseCase,
  ) {}

  /**
   * La société visée est désignée par l'appelant, et vérifiée sienne.
   *
   * Elle se déduisait du token — un compte n'ayant qu'un dossier moral, il n'y
   * avait rien à désigner. Il peut en déclarer plusieurs, donc `pmId` redevient
   * obligatoire ; ce qui ne revient pas, c'est le contrôle d'appartenance
   * écrit ici à la main, avec son 403 qui confirmait l'existence de
   * l'identifiant. `GetProfilPMUseCase` le porte, pour tous ses appelants, et
   * répond « introuvable » à qui n'est pas le titulaire.
   *
   * Passer par le use case plutôt que par le repository ORM referme au passage
   * l'accès direct que ce contrôleur gardait sur la table du dossier moral
   * (§14).
   */
  private async societeSienne(user: ActiveUser, pmId: string): Promise<string> {
    const profilPM = await this.getProfilPM.execute(user.userId, pmId);
    return profilPM.id;
  }

  @ApiOperation({
    summary: "Lister les bénéficiaires effectifs (>25%) d'une de mes sociétés",
  })
  @ApiQuery({ name: 'pmId', description: 'UUID du profil PM' })
  @Get()
  async list(@CurrentUser() user: ActiveUser, @Query('pmId') pmId: string) {
    const profilPMId = await this.societeSienne(user, pmId);
    return this.beneficiaireRepo.find({ where: { profilPMId } });
  }

  @ApiOperation({
    summary: 'Ajouter un bénéficiaire effectif à une de mes sociétés',
  })
  @Post()
  async create(
    @CurrentUser() user: ActiveUser,
    @Body() dto: CreateBeneficiaireEffectifDto,
  ) {
    const { pmId, ...beneficiaire } = dto;
    const profilPMId = await this.societeSienne(user, pmId);
    const entity = this.beneficiaireRepo.create({
      ...beneficiaire,
      profilPMId,
      dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : null,
    });
    return this.beneficiaireRepo.save(entity);
  }

  @ApiOperation({
    summary: "Supprimer un bénéficiaire effectif d'une de mes sociétés",
  })
  @ApiParam({ name: 'id', description: 'UUID du bénéficiaire' })
  @ApiQuery({ name: 'pmId', description: 'UUID du profil PM' })
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('pmId') pmId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const profilPMId = await this.societeSienne(user, pmId);
    // `profilPMId` reste dans le critère de suppression : sans lui, l'UUID d'un
    // bénéficiaire appartenant à quelqu'un d'autre suffirait à l'effacer.
    await this.beneficiaireRepo.delete({ id, profilPMId });
    return { deleted: true };
  }
}

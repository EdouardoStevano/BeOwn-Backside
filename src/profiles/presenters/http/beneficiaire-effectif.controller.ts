import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { BeneficiaireEffectifEntity } from '../../infrastructure/persistences/entities/beneficiaire-effectif.entity';
import { ProfilPMEntity } from '../../infrastructure/persistences/entities/profil-pm.entity';
import { CreateBeneficiaireEffectifDto } from '../dto/beneficiaire-effectif.dto';

@ApiTags('Profiles — Bénéficiaires Effectifs (DBE-S1)')
@ApiBearerAuth()
@Controller('profiles/pm/me/beneficiaires')
@UseGuards(JwtAuthGuard)
export class BeneficiaireEffectifController {
  constructor(
    @InjectRepository(BeneficiaireEffectifEntity)
    private readonly beneficiaireRepo: Repository<BeneficiaireEffectifEntity>,
    @InjectRepository(ProfilPMEntity)
    private readonly profilPMRepo: Repository<ProfilPMEntity>,
  ) {}

  /**
   * Le profil PM visé est celui du porteur du token, jamais un autre.
   *
   * Son identifiant transitait dans l'URL, et la seule chose qu'en faisait
   * cette méthode était de vérifier qu'il valait bien celui du token : un
   * paramètre qui ne pouvait prendre qu'une valeur, et un 403 pour toutes les
   * autres. Le lire depuis le token supprime le paramètre et le contrôle avec
   * lui — il ne reste que le cas où l'utilisateur n'a pas encore de profil PM.
   */
  private async profilPMDe(user: ActiveUser): Promise<ProfilPMEntity> {
    const profilPM = await this.profilPMRepo.findOne({
      where: { utilisateurId: user.userId },
    });
    if (!profilPM) throw new NotFoundException('Profil PM introuvable');
    return profilPM;
  }

  @ApiOperation({
    summary: 'Lister les bénéficiaires effectifs (>25%) de mon profil PM',
  })
  @Get()
  async list(@CurrentUser() user: ActiveUser) {
    const profilPM = await this.profilPMDe(user);
    return this.beneficiaireRepo.find({
      where: { profilPMId: profilPM.utilisateurId },
    });
  }

  @ApiOperation({ summary: 'Ajouter un bénéficiaire effectif à mon profil PM' })
  @Post()
  async create(
    @CurrentUser() user: ActiveUser,
    @Body() dto: CreateBeneficiaireEffectifDto,
  ) {
    const profilPM = await this.profilPMDe(user);
    const entity = this.beneficiaireRepo.create({
      ...dto,
      profilPMId: profilPM.utilisateurId,
      dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : null,
    });
    return this.beneficiaireRepo.save(entity);
  }

  @ApiOperation({
    summary: 'Supprimer un bénéficiaire effectif de mon profil PM',
  })
  @ApiParam({ name: 'id', description: 'UUID du bénéficiaire' })
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    const profilPM = await this.profilPMDe(user);
    // `profilPMId` reste dans le critère de suppression : sans lui, l'UUID d'un
    // bénéficiaire appartenant à quelqu'un d'autre suffirait à l'effacer.
    await this.beneficiaireRepo.delete({
      id,
      profilPMId: profilPM.utilisateurId,
    });
    return { deleted: true };
  }
}

import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { BeneficiaireEffectifEntity } from '../../infrastructure/persistences/entities/beneficiaire-effectif.entity';
import { ProfilPMEntity } from '../../infrastructure/persistences/entities/profil-pm.entity';
import { CreateBeneficiaireEffectifDto } from '../dto/beneficiaire-effectif.dto';
import { AuditSansCorps } from 'src/common/audit/audit-sans-corps.decorator';

@ApiTags('Profiles — Bénéficiaires Effectifs (DBE-S1)')
@ApiBearerAuth()
// Identité nominative de TIERS (bénéficiaires effectifs d'une personne
// morale) : jamais recopiée dans le journal d'audit.
@AuditSansCorps()
@Controller('profiles/pm/:utilisateurId/beneficiaires')
@UseGuards(JwtAuthGuard)
export class BeneficiaireEffectifController {
  constructor(
    @InjectRepository(BeneficiaireEffectifEntity)
    private readonly beneficiaireRepo: Repository<BeneficiaireEffectifEntity>,
    @InjectRepository(ProfilPMEntity)
    private readonly profilPMRepo: Repository<ProfilPMEntity>,
  ) {}

  private async assertOwnership(profilPMId: number, userId: number): Promise<ProfilPMEntity> {
    const profilPM = await this.profilPMRepo.findOne({ where: { utilisateurId: profilPMId } });
    if (!profilPM) throw new NotFoundException('Profil PM introuvable');
    if (profilPM.utilisateurId !== userId) {
      throw new ForbiddenException('Ce profil PM ne vous appartient pas');
    }
    return profilPM;
  }

  @ApiOperation({ summary: 'Lister les bénéficiaires effectifs (>25%) du profil PM' })
  @ApiParam({ name: 'utilisateurId', description: 'ID utilisateur du profil PM' })
  @Get()
  async list(@Param('utilisateurId', ParseIntPipe) utilisateurId: number, @CurrentUser() user: ActiveUser) {
    await this.assertOwnership(utilisateurId, user.userId);
    return this.beneficiaireRepo.find({ where: { profilPMId: utilisateurId } });
  }

  @ApiOperation({ summary: 'Ajouter un bénéficiaire effectif' })
  @ApiParam({ name: 'utilisateurId', description: 'ID utilisateur du profil PM' })
  @Post()
  async create(
    @Param('utilisateurId', ParseIntPipe) utilisateurId: number,
    @CurrentUser() user: ActiveUser,
    @Body() dto: CreateBeneficiaireEffectifDto,
  ) {
    await this.assertOwnership(utilisateurId, user.userId);
    const entity = this.beneficiaireRepo.create({
      ...dto,
      profilPMId: utilisateurId,
      dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : null,
    });
    return this.beneficiaireRepo.save(entity);
  }

  @ApiOperation({ summary: 'Supprimer un bénéficiaire effectif' })
  @ApiParam({ name: 'id', description: 'UUID du bénéficiaire' })
  @Delete(':id')
  async remove(
    @Param('utilisateurId', ParseIntPipe) utilisateurId: number,
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertOwnership(utilisateurId, user.userId);
    await this.beneficiaireRepo.delete({ id, profilPMId: utilisateurId });
    return { deleted: true };
  }
}

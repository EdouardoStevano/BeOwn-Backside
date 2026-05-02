import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  HttpCode,
  HttpStatus,
  Get,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CreateProfilPPUseCase } from 'src/profiles/applications/usecases/create-profil-pp.usecase';
import { CreateKycUseCase } from 'src/profiles/applications/usecases/create-kyc.usecase';
import { UpdateKycStatusUseCase } from 'src/profiles/applications/usecases/update-kyc-status.usecase';
import { GetProfilPPUseCase } from 'src/profiles/applications/usecases/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from 'src/profiles/applications/usecases/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from 'src/profiles/applications/usecases/create-profil-pm.usecase';
import { GetKycUseCase } from 'src/profiles/applications/usecases/get-kyc.usecase';
import {
  CreateProfilPPDto,
  UpdateKycStatusDto,
  CreateProfilPMDto,
} from '../dto/profil.dto';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';

@ApiTags('Profiles & KYC')
@ApiBearerAuth()
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly createProfilPP: CreateProfilPPUseCase,
    private readonly createKyc: CreateKycUseCase,
    private readonly updateKycStatus: UpdateKycStatusUseCase,
    private readonly getProfilPP: GetProfilPPUseCase,
    private readonly updateProfilPP: UpdateProfilPPUseCase,
    private readonly createProfilPM: CreateProfilPMUseCase,
    private readonly getKyc: GetKycUseCase,
  ) {}

  @ApiOperation({ summary: 'Créer le profil personne physique' })
  @ApiResponse({ status: 201, description: 'Profil PP créé' })
  @ApiResponse({ status: 409, description: 'Profil déjà existant' })
  @Post(':userId/pp')
  createPP(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: CreateProfilPPDto,
  ) {
    return this.createProfilPP.execute(userId, dto);
  }

  @ApiOperation({ summary: 'Initialiser le dossier KYC' })
  @ApiResponse({ status: 201, description: 'KYC créé' })
  @Post(':userId/kyc')
  initKyc(@Param('userId', ParseIntPipe) userId: number) {
    return this.createKyc.execute(userId);
  }

  @ApiOperation({ summary: 'Mettre à jour le statut KYC (admin)' })
  @ApiResponse({ status: 200, description: 'Statut KYC mis à jour' })
  @ApiResponse({ status: 404, description: 'KYC introuvable' })
  @HttpCode(HttpStatus.OK)
  @Patch(':userId/kyc/status')
  patchKycStatus(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateKycStatusDto,
  ) {
    return this.updateKycStatus.execute(userId, dto.status, dto.motifRefus);
  }

  @ApiOperation({ summary: 'Obtenir mon profil PP' })
  @ApiResponse({ status: 200, description: 'Profil PP retourné' })
  @Get('pp/me')
  getMyProfilePP(@CurrentUser() user: ActiveUser) {
    return this.getProfilPP.execute(user.userId);
  }

  @ApiOperation({ summary: 'Mettre à jour mon profil PP' })
  @ApiResponse({ status: 200, description: 'Profil PP mis à jour' })
  @Patch('pp/me')
  updateMyProfilePP(
    @CurrentUser() user: ActiveUser,
    @Body() dto: Partial<CreateProfilPPDto>,
  ) {
    return this.updateProfilPP.execute(user.userId, dto);
  }

  @ApiOperation({ summary: 'Créer le profil personne morale' })
  @ApiResponse({ status: 201, description: 'Profil PM créé' })
  @Post('pm/me')
  createPM(@CurrentUser() user: ActiveUser, @Body() dto: CreateProfilPMDto) {
    return this.createProfilPM.execute(user.userId, dto);
  }

  @ApiOperation({ summary: 'Obtenir mon KYC' })
  @ApiResponse({ status: 200, description: 'KYC retourné' })
  @Get('kyc/me')
  getMyKyc(@CurrentUser() user: ActiveUser) {
    return this.getKyc.execute(user.userId);
  }

  @ApiOperation({ summary: 'Lister tous les KYC (admin)' })
  @ApiResponse({ status: 200, description: 'Liste des KYC' })
  @Get('kyc/all')
  listAllKyc() {
    return this.getKyc.executeAll();
  }
}

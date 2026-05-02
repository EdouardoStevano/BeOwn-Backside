import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondary-market/infrastructures/persistences/entities/ordre-marche.entity';
import { CreateOrdreMarcheDto } from '../dto/ordre-marche.dto';
import {
  OrdreMarcheStatus,
  OrdreMarcheSens,
} from 'src/secondary-market/domains/ordre-marche';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';

@ApiTags('Marché Secondaire')
@ApiBearerAuth()
@Controller('secondary-market')
@UseGuards(JwtAuthGuard)
export class SecondaryMarketController {
  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
  ) {}

  @ApiOperation({ summary: "Carnet d'ordres (lecture publique)" })
  @ApiResponse({ status: 200, description: 'Liste des ordres actifs' })
  @Get('orders')
  listOrders() {
    return this.ordreRepo.find({
      where: { statut: OrdreMarcheStatus.EN_CARNET },
      order: { createdAt: 'DESC' },
    });
  }

  @ApiOperation({ summary: 'Passer un ordre de vente' })
  @ApiResponse({ status: 201, description: 'Ordre enregistré dans le carnet' })
  @Post('orders')
  async createOrder(
    @Body() dto: CreateOrdreMarcheDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const ordre = this.ordreRepo.create({
      investissementId: dto.investissementId,
      vendeurId: user.userId,
      sens: dto.sens,
      montant: dto.montant,
      prixUnitaire: dto.prixUnitaire,
      statut: OrdreMarcheStatus.EN_CARNET,
      valideJusquAu: dto.valideJusquAu ? new Date(dto.valideJusquAu) : null,
    });
    return this.ordreRepo.save(ordre);
  }

  @ApiOperation({ summary: "Passer un ordre d'achat" })
  @ApiResponse({ status: 201, description: "Ordre d'achat enregistré" })
  @Post('orders/buy')
  async createBuyOrder(
    @Body() dto: CreateOrdreMarcheDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const ordre = this.ordreRepo.create({
      investissementId: dto.investissementId,
      vendeurId: user.userId,
      sens:
        dto.sens === OrdreMarcheSens.VENTE
          ? OrdreMarcheSens.RACHAT_PLATEFORME
          : dto.sens,
      montant: dto.montant,
      prixUnitaire: dto.prixUnitaire,
      statut: OrdreMarcheStatus.EN_CARNET,
      valideJusquAu: dto.valideJusquAu ? new Date(dto.valideJusquAu) : null,
      acheteurId: user.userId,
    });
    return this.ordreRepo.save(ordre);
  }

  @ApiOperation({ summary: 'Exécuter un ordre (match)' })
  @ApiResponse({ status: 200, description: 'Ordre exécuté' })
  @HttpCode(HttpStatus.OK)
  @Post('orders/:id/execute')
  async executeOrder(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    const ordre = await this.ordreRepo.findOne({ where: { id } });
    if (!ordre) return { success: false, message: 'Ordre introuvable' };
    if (ordre.statut !== OrdreMarcheStatus.EN_CARNET) {
      return { success: false, message: 'Ordre non disponible' };
    }
    ordre.acheteurId = user.userId;
    ordre.statut = OrdreMarcheStatus.EXECUTE;
    return this.ordreRepo.save(ordre);
  }

  @ApiOperation({ summary: 'Annuler un ordre' })
  @ApiResponse({ status: 200, description: 'Ordre annulé' })
  @HttpCode(HttpStatus.OK)
  @Delete('orders/:id/cancel')
  async cancelOrder(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    const ordre = await this.ordreRepo.findOne({ where: { id } });
    if (!ordre) return { success: false, message: 'Ordre introuvable' };
    if (ordre.vendeurId !== user.userId) {
      return { success: false, message: 'Non autorisé' };
    }
    ordre.statut = OrdreMarcheStatus.ANNULE;
    return this.ordreRepo.save(ordre);
  }
}

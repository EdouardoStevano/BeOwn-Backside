import {
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { Roles } from 'src/common/auth/roles.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity, UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { IfuGenerationService } from 'src/investments/applications/ifu-generation.service';

const ADMIN_ROLES: string[] = [UserRole.ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE];

@ApiTags('Admin — Fiscal')
@ApiBearerAuth()
@Controller('admin/fiscal')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE)
export class AdminFiscalController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly ifuService: IfuGenerationService,
  ) {}

  private async assertAdmin(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  @ApiOperation({ summary: 'Déclencher manuellement la génération des IFU pour une année donnée' })
  @ApiParam({ name: 'year', description: 'Année fiscale (ex: 2024)', type: Number })
  @HttpCode(HttpStatus.OK)
  @Post('ifu/:year/generate')
  async generateIfus(
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertAdmin(user.userId);
    return this.ifuService.generateForYear(year);
  }
}

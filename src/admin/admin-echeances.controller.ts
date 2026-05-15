import {
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity, UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { PayEcheanceUseCase } from 'src/investments/applications/usecases/pay-echeance.usecase';

const ADMIN_ROLES: string[] = [UserRole.ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE];

@ApiTags('Admin — Échéances')
@ApiBearerAuth()
@Controller('admin/echeances')
@UseGuards(JwtAuthGuard)
export class AdminEcheancesController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly payEcheance: PayEcheanceUseCase,
  ) {}

  private async assertAdmin(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  @ApiOperation({ summary: "Marquer une échéance comme payée (crédite le wallet)" })
  @ApiParam({ name: 'id', description: "UUID de l'échéance" })
  @HttpCode(HttpStatus.OK)
  @Post(':id/pay')
  async markPaid(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    await this.assertAdmin(user.userId);
    return this.payEcheance.execute(id, user.userId);
  }
}

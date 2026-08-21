import {
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { randomBytes } from 'crypto';

@ApiTags('CGP / Distributeurs')
@ApiBearerAuth()
@Controller('cgp')
@UseGuards(JwtAuthGuard)
export class CgpController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investmentRepo: Repository<InvestmentEntity>,
  ) {}

  private requireCgp(user: ActiveUser) {
    if (user.role !== UserRole.CGP) {
      throw new ForbiddenException('Accès réservé aux CGP/Distributeurs.');
    }
  }

  @ApiOperation({ summary: 'Mes statistiques CGP (AUM, nb clients, commissions estimées)' })
  @Get('me/stats')
  async getMyStats(@CurrentUser() user: ActiveUser) {
    this.requireCgp(user);

    const clients = await this.userRepo.find({ where: { cgpId: user.userId } });
    const clientIds = clients.map((c) => c.userId);

    let totalAum = 0;
    let nbInvestissements = 0;

    if (clientIds.length > 0) {
      const investments = await this.investmentRepo
        .createQueryBuilder('inv')
        .where('inv.utilisateurId IN (:...ids)', { ids: clientIds })
        .andWhere("inv.statut NOT IN ('ANNULE', 'RETRACTE')")
        .getMany();

      for (const inv of investments) {
        totalAum += Number(inv.montant ?? 0);
        nbInvestissements++;
      }
    }

    const commissionEstimee = Math.round(totalAum * 0.005 * 100) / 100;

    return {
      cgpId: user.userId,
      nbClients: clients.length,
      nbInvestissements,
      totalAum: Math.round(totalAum * 100) / 100,
      commissionEstimee,
    };
  }

  @ApiOperation({ summary: 'Liste de mes clients avec leurs investissements' })
  @Get('me/clients')
  async getMyClients(@CurrentUser() user: ActiveUser) {
    this.requireCgp(user);

    const clients = await this.userRepo.find({
      where: { cgpId: user.userId },
      relations: ['userEmail'],
    });

    const result = await Promise.all(
      clients.map(async (client) => {
        const investments = await this.investmentRepo.find({
          where: { utilisateurId: client.userId },
        });
        const aum = investments
          .filter((i) => !['ANNULE', 'RETRACTE'].includes(i.statut as string))
          .reduce((s, i) => s + Number(i.montant ?? 0), 0);

        return {
          userId: client.userId,
          firstName: client.firstname,
          lastName: client.lastname,
          email: (client as any).userEmail?.email ?? null,
          role: client.role,
          userType: client.userType,
          nbInvestissements: investments.length,
          aum: Math.round(aum * 100) / 100,
          createdAt: client.createdAt,
        };
      }),
    );

    return result;
  }

  @ApiOperation({ summary: 'Générer ou régénérer mon code de parrainage CGP' })
  @Patch('me/referral-code')
  async generateReferralCode(@CurrentUser() user: ActiveUser) {
    this.requireCgp(user);

    const cgp = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!cgp) throw new NotFoundException('Utilisateur introuvable.');

    const code = `CGP-${randomBytes(4).toString('hex').toUpperCase()}`;
    cgp.cgpReferralCode = code;
    await this.userRepo.save(cgp);

    return { referralCode: code };
  }

  @ApiOperation({ summary: "Lier un client à ce CGP via son userId (admin ou auto via code)" })
  @Patch('clients/:clientId/link')
  async linkClient(
    @Param('clientId', ParseIntPipe) clientId: number,
    @CurrentUser() user: ActiveUser,
  ) {
    if (user.role !== UserRole.CGP && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Accès refusé.');
    }

    const client = await this.userRepo.findOne({ where: { userId: clientId } });
    if (!client) throw new NotFoundException('Client introuvable.');

    client.cgpId = user.role === UserRole.CGP ? user.userId : client.cgpId;
    await this.userRepo.save(client);

    return { clientId, cgpId: client.cgpId, linked: true };
  }

  @ApiOperation({ summary: "Rejoindre un CGP via son code de parrainage" })
  @Patch('join/:referralCode')
  async joinViaCgpCode(
    @Param('referralCode') referralCode: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const cgp = await this.userRepo.findOne({
      where: { cgpReferralCode: referralCode, role: UserRole.CGP },
    });
    if (!cgp) throw new NotFoundException('Code de parrainage invalide ou expiré.');

    const me = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!me) throw new NotFoundException('Utilisateur introuvable.');
    if (me.cgpId) throw new ForbiddenException('Vous êtes déjà lié à un CGP.');

    me.cgpId = cgp.userId;
    await this.userRepo.save(me);

    return { cgpId: cgp.userId, cgpName: [cgp.firstname, cgp.lastname].filter(Boolean).join(' '), linked: true };
  }
}

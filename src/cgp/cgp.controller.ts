import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { randomBytes } from 'crypto';
import { LinkClientToCgpDto } from './dto/link-client-to-cgp.dto';

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

  /**
   * Rattachement d'un client à un CGP, DÉCIDÉ PAR LA PLATEFORME.
   *
   * IDOR corrigé : la route acceptait n'importe quel `clientId` de la part de
   * n'importe quel CGP et écrivait `client.cgpId = user.userId`. Un CGP
   * pouvait donc s'attribuer un investisseur qui ne l'avait jamais mandaté,
   * et par là lire son identité, ses investissements et son encours via
   * `GET /cgp/me/clients` — le rattachement N'ÉTAIT PAS consenti par le
   * client. La branche `SUPER_ADMIN` était par ailleurs inopérante :
   * `client.cgpId = client.cgpId` ne changeait rien.
   *
   * Deux chemins légitimes existent désormais, et deux seulement :
   *   - le client s'inscrit lui-même auprès d'un CGP via son code de
   *     parrainage (`PATCH /cgp/join/:referralCode`) — c'est le consentement ;
   *   - la plateforme rattache elle-même, ici, réservé à `super_admin`.
   *
   * SUIVI : le parcours d'INVITATION (le CGP invite, le client accepte) reste
   * à construire. Tant qu'il n'existe pas, un CGP ne rattache personne — la
   * régression fonctionnelle est assumée, c'est le seul état sûr.
   */
  @ApiOperation({
    summary: 'Rattacher un client à un CGP (réservé à la plateforme)',
    description:
      "Réservé à super_admin, rôle relu en base. Un CGP ne peut pas s'attribuer " +
      'un client : le client se rattache lui-même via le code de parrainage.',
  })
  @ApiResponse({ status: 403, description: 'Rôle non habilité' })
  @ApiResponse({ status: 404, description: 'Client ou CGP introuvable' })
  @Patch('clients/:clientId/link')
  async linkClient(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() dto: LinkClientToCgpDto,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertSuperAdmin(user.userId);

    if (clientId === dto.cgpId) {
      throw new BadRequestException(
        'Un CGP ne peut pas être son propre client.',
      );
    }

    const [client, cgp] = await Promise.all([
      this.userRepo.findOne({ where: { userId: clientId } }),
      this.userRepo.findOne({ where: { userId: dto.cgpId } }),
    ]);
    if (!client) throw new NotFoundException('Client introuvable.');
    if (!cgp || cgp.role !== UserRole.CGP) {
      throw new NotFoundException('CGP introuvable.');
    }

    // Le CGP désigné est celui du corps de requête, jamais l'appelant : c'est
    // ce qui rend la branche administrateur effective.
    client.cgpId = cgp.userId;
    await this.userRepo.save(client);

    return { clientId, cgpId: client.cgpId, linked: true };
  }

  /**
   * Rôle RELU EN BASE, et pas seulement lu dans le jeton. Le claim `role`
   * identifie, il n'autorise jamais (ADR-role-relu-en-base-et-usertype) : un
   * jeton antérieur au retrait d'un rôle administrateur ne doit pas pouvoir
   * réassigner la clientèle d'un distributeur.
   */
  private async assertSuperAdmin(userId: number): Promise<void> {
    const acteur = await this.userRepo.findOne({ where: { userId } });
    if (!acteur || acteur.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Rattachement réservé à la plateforme. Un client se rattache à un CGP ' +
          'par son code de parrainage.',
      );
    }
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

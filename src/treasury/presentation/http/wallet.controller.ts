import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { WalletSnapshot } from 'src/treasury/domain/aggregates/wallet';
import type { TransactionSnapshot } from 'src/treasury/domain/aggregates/transaction';
import { Money } from 'src/treasury/domain/value-objects/money.vo';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { hasPermission } from 'src/iam/domain/policies/role-permissions.policy';
import type { DemandeurDePortefeuille } from 'src/treasury/domain/specifications/portefeuille-lisible.specification';
import { ConsulterUnPortefeuilleUseCase } from '../../application/usecases/consulter-un-portefeuille.usecase';
import { ConsulterLePortefeuilleDunTitulaireUseCase } from '../../application/usecases/consulter-le-portefeuille-dun-titulaire.usecase';
import { ListerLesMouvementsDunPortefeuilleUseCase } from '../../application/usecases/lister-les-mouvements-dun-portefeuille.usecase';
import { OuvrirUnPortefeuilleDePlateformeUseCase } from '../../application/usecases/ouvrir-un-portefeuille-de-plateforme.usecase';
import { ConsignerUnMouvementManuelUseCase } from '../../application/usecases/consigner-un-mouvement-manuel.usecase';
import { CreateTransactionDto, CreateWalletDto } from './dto/wallet.dto';

/**
 * Les routes du portefeuille : consultation, ouverture d'un portefeuille de
 * plateforme, et relevé des mouvements.
 *
 * **Le contrôleur route, il ne décide de rien** (§14). Il se faisait injecter
 * les deux repositories du contexte et portait deux règles qui n'ont rien de
 * la présentation : qui a le droit de lire un solde, et le fait qu'un
 * portefeuille naisse de la première visite de son titulaire — mais pas de
 * celle d'un administrateur. La première est une Specification du domaine
 * ({@link PortefeuilleLisibleSpecification}), la seconde vit dans
 * {@link ConsulterLePortefeuilleDunTitulaireUseCase}.
 *
 * Ce qui reste ici est le **RBAC**, et lui seul : traduire la permission
 * `platform:wallet` en un booléen que l'application comprend, sans lui faire
 * connaître le nom d'une permission ni la table des rôles (§3.3). C'est la
 * même frontière que `KycController` trace avec `DemandeurDeSession`.
 *
 * Les erreurs métier remontent telles quelles : `TreasuryErrorFilter` les
 * traduit en réponses HTTP (§21). Les clés JSON publiées sont inchangées.
 */
@ApiTags('Wallets & Transactions')
@ApiBearerAuth()
@Controller('wallets')
export class WalletController {
  constructor(
    private readonly consulterUnPortefeuille: ConsulterUnPortefeuilleUseCase,
    private readonly consulterCeluiDunTitulaire: ConsulterLePortefeuilleDunTitulaireUseCase,
    private readonly listerLesMouvements: ListerLesMouvementsDunPortefeuilleUseCase,
    private readonly ouvrirPourLaPlateforme: OuvrirUnPortefeuilleDePlateformeUseCase,
    private readonly consignerUnMouvement: ConsignerUnMouvementManuelUseCase,
  ) {}

  /** Le demandeur, permission déjà résolue en booléen. */
  private demandeur(user: ActiveUser): DemandeurDePortefeuille {
    return {
      utilisateurId: user.userId,
      peutGererLesPortefeuilles: hasPermission(user.role, 'platform:wallet'),
    };
  }

  @ApiOperation({ summary: 'Créer un wallet de plateforme' })
  @ApiResponse({ status: 201, description: 'Wallet créé' })
  @ApiResponse({
    status: 400,
    description: 'Un portefeuille d’investisseur ne s’ouvre pas sans titulaire',
  })
  @Post()
  @RequirePermission('platform:wallet')
  async createWallet(@Body() dto: CreateWalletDto): Promise<WalletSnapshot> {
    const wallet = await this.ouvrirPourLaPlateforme.execute({
      type: dto.type,
      fournisseurRef: dto.fournisseurRef,
      devise: dto.devise,
    });
    return wallet.snapshot();
  }

  @ApiOperation({
    summary: "Wallet d'un utilisateur",
    description:
      'Le titulaire se voit ouvrir son portefeuille à la première visite ; ' +
      'un tiers, même habilité, ne provoque pas cette ouverture.',
  })
  @ApiParam({ name: 'userId', description: "ID numérique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Wallet trouvé' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Wallet introuvable' })
  @Get('user/:userId')
  async getUserWallet(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: ActiveUser,
  ): Promise<WalletSnapshot> {
    const wallet = await this.consulterCeluiDunTitulaire.execute(
      userId,
      this.demandeur(user),
    );
    return wallet.snapshot();
  }

  @ApiOperation({ summary: "Détail d'un wallet" })
  @ApiParam({ name: 'id', description: 'UUID du wallet' })
  @ApiResponse({ status: 200, description: 'Wallet trouvé' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Wallet introuvable' })
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ): Promise<WalletSnapshot> {
    const wallet = await this.consulterUnPortefeuille.execute(
      id,
      this.demandeur(user),
    );
    return wallet.snapshot();
  }

  @ApiOperation({ summary: "Transactions d'un wallet" })
  @ApiParam({ name: 'id', description: 'UUID du wallet' })
  @ApiResponse({ status: 200, description: 'Liste des transactions' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @Get(':id/transactions')
  getTransactions(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ): Promise<TransactionSnapshot[]> {
    return this.listerLesMouvements.execute(id, this.demandeur(user));
  }

  @ApiOperation({
    summary: 'Consigner un mouvement au registre (back-office)',
    description:
      'Inscrit une ligne au registre **sans toucher à aucun solde** : ' +
      'rapprochement d’un virement reçu hors plateforme, trace d’une ' +
      'régularisation. Le mouvement naît `initie`, rien n’ayant eu lieu que ' +
      'sa consignation.',
  })
  @ApiResponse({ status: 201, description: 'Mouvement consigné' })
  @Post('transactions')
  @RequirePermission('platform:wallet')
  async createTransaction(
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionSnapshot> {
    const mouvement = await this.consignerUnMouvement.execute({
      montant: Money.euros(dto.montant),
      type: dto.type,
      walletSourceId: dto.walletSourceId,
      walletDestinationId: dto.walletDestinationId,
      fournisseur: dto.fournisseur,
      idempotencyKey: dto.idempotencyKey,
      projetId: dto.projetId,
      investissementId: dto.investissementId,
    });
    return mouvement.snapshot();
  }
}

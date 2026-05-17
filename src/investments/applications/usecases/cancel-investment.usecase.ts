import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { InvestmentRepository } from '../ports/repositories/investment.repository';
import { INVESTMENT_REPOSITORY } from '../ports/repositories/investment.repository';
import type { WalletRepository } from 'src/wallets/applications/ports/repositories/wallet.repository';
import { WALLET_REPOSITORY } from 'src/wallets/applications/ports/repositories/wallet.repository';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';

@Injectable()
export class CancelInvestmentUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
  ) {}

  async execute(investmentId: string, userId: number): Promise<void> {
    const inv = await this.investmentRepository.findInvestmentById(investmentId);
    if (!inv) throw new NotFoundException('Investissement introuvable');
    if (inv.utilisateurId !== userId) {
      throw new ForbiddenException('Vous ne pouvez annuler que vos propres investissements');
    }
    if (inv.statut !== InvestmentStatus.CONFIRME) {
      throw new BadRequestException(`Investissement au statut "${inv.statut}" non annulable`);
    }
    if (!inv.delaiRetractationJusquAu) {
      throw new BadRequestException(
        "Cet investissement n'a pas de délai de rétractation (vous êtes investisseur averti ou professionnel)",
      );
    }
    if (new Date() > new Date(inv.delaiRetractationJusquAu)) {
      throw new BadRequestException('Le délai de rétractation de 4 jours est dépassé');
    }

    // Refund the investor wallet
    const wallet = await this.walletRepository.findWalletByUser(userId, WalletType.INVESTISSEUR);
    if (!wallet) throw new NotFoundException('Wallet introuvable');
    await this.walletRepository.updateSolde(wallet.id, Number(inv.montant));

    // Mark investment as retracted
    await this.investmentRepository.updateInvestmentStatus(investmentId, InvestmentStatus.RETRACTE);
  }
}

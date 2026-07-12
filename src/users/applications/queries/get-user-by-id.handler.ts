import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import {
  AccessDeniedError,
  UserNotFoundError,
} from 'src/users/domains/errors/user.errors';
import { UsersAccountService } from '../services/user-account.service';
import { PROFIL_REPOSITORY } from 'src/profiles/applications/ports/repositories/profil.repository';
import type { ProfilRepository } from 'src/profiles/applications/ports/repositories/profil.repository';
import { WALLET_REPOSITORY } from 'src/wallets/applications/ports/repositories/wallet.repository';
import type { WalletRepository } from 'src/wallets/applications/ports/repositories/wallet.repository';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { GetUserByIdQuery } from './get-user-by-id.query';

@QueryHandler(GetUserByIdQuery)
export class GetUserByIdHandler implements IQueryHandler<GetUserByIdQuery> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
  ) {}

  async execute(query: GetUserByIdQuery): Promise<Record<string, unknown>> {
    const isSelf = query.requesterId === query.targetUserId;

    if (!isSelf) {
      const requester = await this.userRepository.findById(query.requesterId);
      if (!requester?.isAdmin) throw new AccessDeniedError();
    }

    const user = await this.userRepository.findById(query.targetUserId);
    if (!user) throw new UserNotFoundError();

    const [kyc, wallet] = await Promise.all([
      this.profilRepository.findKycByUserId(user.userId).catch(() => null),
      this.walletRepository
        .findWalletByUser(user.userId, WalletType.INVESTISSEUR)
        .catch(() => null),
    ]);

    return {
      ...UsersAccountService.toPublicView(user),
      kyc: kyc ?? null,
      wallet: wallet ?? null,
    };
  }
}

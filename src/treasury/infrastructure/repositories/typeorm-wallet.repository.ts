import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletRepository } from 'src/treasury/domain/repositories/wallet.repository';
import {
  Wallet,
  type WalletNaissant,
} from 'src/treasury/domain/aggregates/wallet';
import { WalletType } from 'src/treasury/domain/enums/wallet.enum';
import { WalletEntity } from '../persistence/entities/wallet.entity';
import { WalletOrmMapper } from '../persistence/mappers/wallet.orm-mapper';

@Injectable()
export class TypeOrmWalletRepository implements WalletRepository {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly wallets: Repository<WalletEntity>,
  ) {}

  async creer(naissant: WalletNaissant): Promise<Wallet> {
    const saved = await this.wallets.save(
      WalletOrmMapper.naissantToEntity(naissant),
    );
    return WalletOrmMapper.walletToDomain(saved);
  }

  async save(wallet: Wallet): Promise<Wallet> {
    const saved = await this.wallets.save(
      WalletOrmMapper.walletToEntity(wallet),
    );
    return WalletOrmMapper.walletToDomain(saved);
  }

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.wallets.findOne({ where: { id } });
    return entity ? WalletOrmMapper.walletToDomain(entity) : null;
  }

  async findByUser(userId: number, type?: WalletType): Promise<Wallet | null> {
    const entity = await this.wallets.findOne({
      where: type
        ? { proprietaireUserId: userId, type }
        : { proprietaireUserId: userId },
    });
    return entity ? WalletOrmMapper.walletToDomain(entity) : null;
  }
}

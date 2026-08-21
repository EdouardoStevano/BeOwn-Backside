import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdreMarcheEntity } from './persistences/entities/ordre-marche.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { EcheanceEntity } from 'src/subscription/infrastructure/persistence/entities/echeance.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrdreMarcheEntity,
      InvestmentEntity,
      EcheanceEntity,
      ProjectEntity,
      DocumentEntity,
      SignatureEntity,
      WalletEntity,
      UserEntity,
      UserEmailEntity,
      TransactionEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class SecondaryMarketInfrastructureModule {}

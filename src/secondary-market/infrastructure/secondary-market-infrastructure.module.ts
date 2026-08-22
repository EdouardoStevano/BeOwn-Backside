import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdreMarcheEntity } from './persistence/entities/ordre-marche.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistence/entities/document.entity';
import { SignatureEntity } from 'src/documents/infrastructure/persistence/entities/signature.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';

/**
 * Adapters de sortie du contexte Secondary Market.
 *
 * Il enregistre bien plus que le carnet d'ordres : une cession touche
 * l'investissement cédé, l'échéancier qui le suit, les wallets des deux
 * parties et le contrat signé. Ces entités appartiennent à d'autres contextes
 * et sont ici parce que le règlement d'une cession est une transaction unique,
 * faute d'unité de travail partagée — écart d'infrastructure documenté par
 * `SecondaryMarketModule`, pas frontière de domaine.
 */
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

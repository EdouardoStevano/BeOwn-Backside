import { Wallet } from 'src/treasury/domain/aggregates/wallet';
import { Transaction } from 'src/treasury/domain/aggregates/transaction';
import { WalletEntity } from '../entities/wallet.entity';
import { TransactionEntity } from '../entities/transaction.entity';

export class WalletOrmMapper {
  static walletToDomain(entity: WalletEntity): Wallet {
    const d = new Wallet();
    d.id = entity.id;
    d.type = entity.type;
    d.proprietaireUserId = entity.proprietaireUserId;
    d.projetId = entity.projetId;
    d.spvId = entity.spvId;
    d.fournisseurRef = entity.fournisseurRef;
    d.devise = entity.devise;
    d.solde = Number(entity.solde);
    d.statut = entity.statut;
    d.createdAt = entity.createdAt;
    return d;
  }

  static walletToEntity(domain: Wallet): WalletEntity {
    const e = new WalletEntity();
    if (domain.id) e.id = domain.id;
    e.type = domain.type;
    e.proprietaireUserId = domain.proprietaireUserId;
    e.projetId = domain.projetId;
    e.spvId = domain.spvId;
    e.fournisseurRef = domain.fournisseurRef;
    e.devise = domain.devise;
    e.solde = domain.solde;
    e.statut = domain.statut;
    return e;
  }

  static txToDomain(this: void, entity: TransactionEntity): Transaction {
    const d = new Transaction();
    d.id = entity.id;
    d.walletSource = entity.walletSource;
    d.walletDestination = entity.walletDestination;
    d.montant = Number(entity.montant);
    d.devise = entity.devise;
    d.type = entity.type;
    d.referenceExterne = entity.referenceExterne;
    d.fournisseur = entity.fournisseur;
    d.statut = entity.statut;
    d.investissementId = entity.investissementId;
    d.echeanceId = entity.echeanceId;
    d.reservationId = entity.reservationId;
    d.projetId = entity.projetId;
    d.idempotencyKey = entity.idempotencyKey;
    d.fraisPsp = Number(entity.fraisPsp);
    d.fraisPlateforme = Number(entity.fraisPlateforme);
    d.metadata = entity.metadata;
    d.motifEchec = entity.motifEchec;
    d.createdAt = entity.createdAt;
    d.updatedAt = entity.updatedAt;
    return d;
  }

  static txToEntity(domain: Transaction): TransactionEntity {
    const e = new TransactionEntity();
    if (domain.id) e.id = domain.id;
    e.walletSource = domain.walletSource;
    e.walletDestination = domain.walletDestination;
    e.montant = domain.montant;
    e.devise = domain.devise;
    e.type = domain.type;
    e.referenceExterne = domain.referenceExterne;
    e.fournisseur = domain.fournisseur;
    e.statut = domain.statut;
    e.investissementId = domain.investissementId;
    e.echeanceId = domain.echeanceId;
    e.reservationId = domain.reservationId;
    e.projetId = domain.projetId;
    e.idempotencyKey = domain.idempotencyKey;
    e.fraisPsp = domain.fraisPsp;
    e.fraisPlateforme = domain.fraisPlateforme;
    e.metadata = domain.metadata;
    e.motifEchec = domain.motifEchec;
    return e;
  }
}

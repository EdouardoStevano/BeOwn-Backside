import {
  Wallet,
  type WalletNaissant,
} from 'src/treasury/domain/aggregates/wallet';
import { Transaction } from 'src/treasury/domain/aggregates/transaction';
import { WalletStatut } from 'src/treasury/domain/enums/wallet.enum';
import { WalletEntity } from '../entities/wallet.entity';
import { TransactionEntity } from '../entities/transaction.entity';

/**
 * Traduit entre les agrégats du domaine et les lignes TypeORM (§16).
 *
 * L'ORM rend les colonnes `decimal` en chaînes : c'est ici, et seulement ici,
 * que les `Number(...)` vivent — le domaine ne manipule que des nombres. Le
 * portefeuille se reconstruit depuis son snapshot ; l'ancienne version posait
 * les champs un à un sur une instance vide, ce que l'état privé n'autorise
 * plus.
 */
export class WalletOrmMapper {
  static walletToDomain(entity: WalletEntity): Wallet {
    return new Wallet({
      id: entity.id,
      type: entity.type,
      proprietaireUserId: entity.proprietaireUserId,
      projetId: entity.projetId,
      spvId: entity.spvId,
      fournisseurRef: entity.fournisseurRef,
      devise: entity.devise,
      solde: Number(entity.solde),
      statut: statutDepuisLaBase(entity.statut),
      createdAt: entity.createdAt,
    });
  }

  /** Une ligne prête à être insérée, pour un portefeuille qui vient d'être ouvert. */
  static naissantToEntity(naissant: WalletNaissant): WalletEntity {
    const entity = new WalletEntity();
    entity.type = naissant.type;
    entity.proprietaireUserId = naissant.proprietaireUserId;
    entity.projetId = naissant.projetId;
    entity.spvId = naissant.spvId;
    entity.fournisseurRef = naissant.fournisseurRef;
    entity.devise = naissant.devise;
    entity.solde = naissant.solde;
    entity.statut = naissant.statut;
    return entity;
  }

  /** La ligne correspondant à un agrégat existant, identité comprise. */
  static walletToEntity(wallet: Wallet): WalletEntity {
    const etat = wallet.snapshot();
    const entity = WalletOrmMapper.naissantToEntity(etat);
    entity.id = etat.id;
    return entity;
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

/**
 * La colonne `statut` est un `varchar` libre et n'a jamais porté que `'actif'`.
 * Toute valeur inconnue est traitée comme un gel : devant une donnée qu'on ne
 * sait pas interpréter, refuser les mouvements est le seul défaut sûr pour un
 * solde.
 */
const statutDepuisLaBase = (statut: string): WalletStatut =>
  statut === WalletStatut.ACTIF ? WalletStatut.ACTIF : WalletStatut.GELE;

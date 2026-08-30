import {
  Wallet,
  type WalletNaissant,
} from 'src/treasury/domain/aggregates/wallet';
import {
  Transaction,
  type TransactionNaissante,
} from 'src/treasury/domain/aggregates/transaction';
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
    return new Transaction({
      id: entity.id,
      walletSource: entity.walletSource,
      walletId: entity.walletId,
      walletDestination: entity.walletDestination,
      montant: Number(entity.montant),
      devise: entity.devise,
      type: entity.type,
      referenceExterne: entity.referenceExterne,
      fournisseur: entity.fournisseur,
      fournisseurRef: entity.fournisseurRef,
      statut: entity.statut,
      investissementId: entity.investissementId,
      echeanceId: entity.echeanceId,
      reservationId: entity.reservationId,
      projetId: entity.projetId,
      idempotencyKey: entity.idempotencyKey,
      fraisPsp: Number(entity.fraisPsp),
      fraisPlateforme: Number(entity.fraisPlateforme),
      metadata: entity.metadata,
      motifEchec: entity.motifEchec,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  /**
   * Une ligne prête à être insérée, pour un mouvement qui vient d'être décidé.
   *
   * `walletId` et `fournisseurRef` y figurent enfin. Le modèle anémique qu'ils
   * remplacent ne les portait pas — les colonnes existaient, les parcours de
   * paiement les remplissaient par des écritures directes, mais tout mouvement
   * passé par ce mapper les perdait en route.
   */
  static txNaissanteToEntity(
    naissante: TransactionNaissante,
  ): TransactionEntity {
    const e = new TransactionEntity();
    e.walletSource = naissante.walletSource;
    e.walletId = naissante.walletId;
    e.walletDestination = naissante.walletDestination;
    e.montant = naissante.montant;
    e.devise = naissante.devise;
    e.type = naissante.type;
    e.referenceExterne = naissante.referenceExterne;
    e.fournisseur = naissante.fournisseur;
    e.fournisseurRef = naissante.fournisseurRef;
    e.statut = naissante.statut;
    e.investissementId = naissante.investissementId;
    e.echeanceId = naissante.echeanceId;
    e.reservationId = naissante.reservationId;
    e.projetId = naissante.projetId;
    e.idempotencyKey = naissante.idempotencyKey;
    e.fraisPsp = naissante.fraisPsp;
    e.fraisPlateforme = naissante.fraisPlateforme;
    e.metadata = naissante.metadata;
    e.motifEchec = naissante.motifEchec;
    return e;
  }

  /** La ligne correspondant à un mouvement existant, identité comprise. */
  static txToEntity(domain: Transaction): TransactionEntity {
    const etat = domain.snapshot();
    const e = WalletOrmMapper.txNaissanteToEntity(etat);
    e.id = etat.id;
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
  // La comparaison passe par la valeur de l'enum, et non par l'enum lui-même :
  // `statut` est un `string` venu d'une colonne libre, et confronter les deux
  // directement laisse croire à un typage que la base ne garantit pas.
  statut === String(WalletStatut.ACTIF)
    ? WalletStatut.ACTIF
    : WalletStatut.GELE;

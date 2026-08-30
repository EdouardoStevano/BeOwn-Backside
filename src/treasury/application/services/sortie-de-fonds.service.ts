import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from 'src/treasury/domain/repositories/transaction.repository';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from 'src/treasury/domain/repositories/wallet.repository';
import type { Wallet } from 'src/treasury/domain/aggregates/wallet';
import type {
  MetadonneesMouvement,
  Transaction,
} from 'src/treasury/domain/aggregates/transaction';
import {
  TransactionStatus,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';
import type { Money } from 'src/treasury/domain/value-objects/money.vo';
import {
  CleDIdempotence,
  TransactionFactory,
} from 'src/treasury/domain/factories/transaction.factory';
import {
  SoldeInsuffisantError,
  WalletIntrouvableError,
} from 'src/treasury/domain/errors/treasury.errors';

/** Ce qu'il faut savoir pour sortir des fonds d'un portefeuille. */
export interface DebitDeRetrait {
  utilisateurId: number;
  montant: Money;
  /** Portefeuille source ; par défaut celui d'investissement du titulaire. */
  walletId?: string;
  /** `EN_COURS` pour un versement lancé, `EN_ATTENTE_PAIEMENT` pour le manuel. */
  statutInitial: TransactionStatus;
  ibanDestination?: string;
  cleCliente?: string;
  metadata?: MetadonneesMouvement;
}

/**
 * Ce qu'est devenu le débit.
 *
 * `deja-demande` n'est pas un échec : c'est la même demande, reconnue. La
 * distinguer de `solde-insuffisant` importe — confondre les deux ferait lire
 * au titulaire qu'il n'a plus d'argent alors qu'il vient simplement de
 * soumettre deux fois.
 */
export type ResultatDuDebit =
  | { issue: 'debite'; mouvement: Transaction }
  | { issue: 'deja-demande'; mouvement: Transaction }
  | { issue: 'solde-insuffisant'; motif: string };

/**
 * Sortir des fonds d'un portefeuille, et en garder la trace.
 *
 * **Tout ce qui touche le solde et le registre, et rien d'autre.** Le service
 * ignore par quel rail l'argent partira ensuite — compte connecté, virement
 * manuel — et c'est ce qui lui permet de servir les deux : le débit, sa
 * condition et sa consignation sont les mêmes, seul l'acheminement diffère.
 *
 * **La règle est éprouvée deux fois, et les deux comptent.** L'agrégat la
 * porte : il refuse un portefeuille gelé — ce que le décrément conditionnel
 * ignore — et compose le message que lit le titulaire, avec le disponible et
 * le requis. Le registre la rejoue ensuite en base, sous verrou, parce que
 * deux demandes concurrentes éprouveraient sinon la même lecture obsolète et
 * passeraient toutes les deux. Aucune ne remplace l'autre.
 */
@Injectable()
export class SortieDeFondsService {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly wallets: WalletRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly registre: TransactionRepository,
  ) {}

  /**
   * Le retrait déjà ouvert sous la clé du client, s'il y en a un.
   *
   * La clé est demandée à {@link CleDIdempotence}, qui la compose aussi à
   * l'écriture : elle était formée à la main des deux côtés, et deux
   * compositions divergentes valent une idempotence qui ne protège de rien.
   */
  async retraitDejaDemande(
    utilisateurId: number,
    cleCliente?: string,
  ): Promise<Transaction | null> {
    if (!cleCliente) return null;

    return this.registre.findByIdempotencyKey(
      CleDIdempotence.retrait(utilisateurId, cleCliente),
    );
  }

  /** Débite le portefeuille et consigne le mouvement, d'un seul geste. */
  async debiter(demande: DebitDeRetrait): Promise<ResultatDuDebit> {
    const portefeuille = await this.portefeuilleSource(demande);

    const refus = this.eprouverSurLAgregat(portefeuille, demande.montant);
    if (refus) return refus;

    const consignation = await this.registre.consignerUnDebit(
      TransactionFactory.retrait({
        walletId: portefeuille.id,
        montant: demande.montant,
        utilisateurId: demande.utilisateurId,
        statutInitial: demande.statutInitial,
        cleCliente: demande.cleCliente,
        ibanDestination: demande.ibanDestination ?? null,
        metadata: demande.metadata,
      }),
    );

    if (consignation.issue === 'consigne') {
      return { issue: 'debite', mouvement: consignation.mouvement };
    }

    // Deux soumissions de la même clé se sont croisées : la relecture d'entrée
    // n'a rien vu, et c'est la contrainte d'unicité qui a tranché. Le débit est
    // défait avec la transaction ; il reste à rendre le retrait déjà ouvert.
    // Sans cette branche, une collision de clé serait rendue au titulaire en
    // « solde insuffisant » — faux, et alarmant.
    if (consignation.issue === 'deja-consigne') {
      const rejeu = await this.retraitDejaDemande(
        demande.utilisateurId,
        demande.cleCliente,
      );
      if (rejeu) return { issue: 'deja-demande', mouvement: rejeu };
    }

    // La condition en base a tranché après l'agrégat : entre les deux lectures,
    // un autre mouvement est passé. Le titulaire lit le même refus.
    return { issue: 'solde-insuffisant', motif: 'Solde insuffisant' };
  }

  /**
   * Rattache au mouvement ce que l'acheminement a produit, et le persiste.
   *
   * Le service possède le registre : c'est donc lui qui écrit, et le use case
   * qui orchestre n'a pas à connaître un repository pour cela (§14).
   */
  async rattacherLAcheminement(
    mouvement: Transaction,
    references: { transfertId: string; versementId?: string },
  ): Promise<void> {
    mouvement.rattacherLeTransfert(references.transfertId);
    if (references.versementId) {
      mouvement.rattacherLeVersement(references.versementId);
    }
    await this.registre.save(mouvement);
  }

  /**
   * La règle du domaine, jouée sur l'agrégat chargé.
   *
   * @returns le refus à rendre, ou `null` si le débit est permis. Seule
   *   `SoldeInsuffisantError` est traduite en refus : un portefeuille **gelé**
   *   remonte, parce que ce n'est pas au titulaire de le corriger et qu'un
   *   `202 { success: false }` le laisserait croire à un simple manque de
   *   fonds.
   */
  private eprouverSurLAgregat(
    portefeuille: Wallet,
    montant: Money,
  ): ResultatDuDebit | null {
    try {
      portefeuille.debiter(montant);
      return null;
    } catch (err) {
      if (err instanceof SoldeInsuffisantError) {
        return { issue: 'solde-insuffisant', motif: 'Solde insuffisant' };
      }
      throw err;
    }
  }

  /**
   * Le portefeuille à débiter : celui qu'on désigne, ou celui d'investissement
   * du titulaire quand le front n'envoie que le montant.
   *
   * Dans les deux cas la titularité est **vérifiée**, et un `walletId` qui
   * n'appartient pas à l'appelant est traité comme introuvable plutôt que comme
   * un refus — dire « ce portefeuille n'est pas le vôtre » confirmerait son
   * existence à qui le sonde.
   */
  private async portefeuilleSource(demande: DebitDeRetrait): Promise<Wallet> {
    if (demande.walletId) {
      const cible = await this.wallets.findById(demande.walletId);
      if (!cible?.appartientA(demande.utilisateurId)) {
        throw new WalletIntrouvableError(demande.walletId);
      }
      return cible;
    }

    const propre = await this.wallets.findByUser(
      demande.utilisateurId,
      WalletType.INVESTISSEUR,
    );
    if (!propre) throw new WalletIntrouvableError();
    return propre;
  }
}

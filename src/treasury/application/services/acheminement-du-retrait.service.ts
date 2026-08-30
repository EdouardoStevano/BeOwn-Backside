import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Money } from 'src/treasury/domain/value-objects/money.vo';
import {
  CONNECT_GATEWAY,
  type CompteDeRetrait,
  type ConnectGateway,
} from '../ports/connect.gateway';

/** Aucun compte joignable : le repli, jamais un compte présumé prêt. */
const COMPTE_INDISPONIBLE: CompteDeRetrait = {
  connected: false,
  accountId: null,
  detailsSubmitted: false,
  chargesEnabled: false,
  payoutsEnabled: false,
};

/** Ce qu'a donné l'acheminement des fonds vers la banque du titulaire. */
export type ResultatDeLAcheminement =
  | { issue: 'achemine'; transfertId: string; versementId?: string }
  /** Rien n'a quitté la plateforme : le débit doit être défait intégralement. */
  | { issue: 'transfert-refuse'; motif: string };

/**
 * Porter les fonds jusqu'à la banque du titulaire.
 *
 * **Tout ce qui parle au fournisseur, et rien d'autre.** Ce service ne connaît
 * ni portefeuille, ni registre, ni agrégat : il reçoit un montant et un compte,
 * et rend les références de ce qu'il a déclenché. C'est ce qui permet de
 * l'éprouver sans base de données, et de changer de rail sans toucher au débit.
 *
 * **Les deux appels n'ont pas le même poids, et c'est la règle qui compte
 * ici** :
 *
 * - le **transfert** porte les fonds de la plateforme vers le compte du
 *   titulaire. S'il échoue, rien n'a bougé : l'appelant doit défaire le débit
 *   intégralement ;
 * - le **versement** vers la banque est *best-effort*. Un refus signifie
 *   presque toujours que le compte verse déjà automatiquement — le cas par
 *   défaut des comptes Express. Le transfert, lui, a réussi : **ne rien
 *   défaire**, sous peine de rapatrier des fonds déjà en route.
 *
 * Confondre les deux est l'erreur qui coûte cher, dans un sens comme dans
 * l'autre : défaire sur un versement refusé rappellerait de l'argent parti,
 * ne pas défaire sur un transfert refusé laisserait un solde débité sans
 * contrepartie.
 */
@Injectable()
export class AcheminementDuRetraitService {
  private readonly logger = new Logger(AcheminementDuRetraitService.name);

  constructor(
    @Inject(CONNECT_GATEWAY)
    private readonly connect: ConnectGateway,
  ) {}

  /**
   * L'état du compte de retrait, en *best-effort*.
   *
   * Un incident chez le fournisseur ne doit pas empêcher le parcours de secours
   * de prendre le relais : l'indisponibilité se replie sur un compte **non
   * connecté**, jamais sur un compte présumé prêt — qui ferait partir un
   * transfert vers un compte dont on ignore l'état.
   */
  async compteDeRetrait(utilisateurId: number): Promise<CompteDeRetrait> {
    try {
      return await this.connect.statutDuCompte(utilisateurId);
    } catch (err) {
      this.logger.warn(
        `Retrait: statut du compte de retrait indisponible ` +
          `userId=${utilisateurId}: ${message(err)}`,
      );
      return COMPTE_INDISPONIBLE;
    }
  }

  /**
   * Transfert puis versement, dans cet ordre.
   *
   * Les clés d'idempotence dérivent du mouvement : rejouer l'acheminement du
   * même retrait — retry réseau, resoumission — ne crée ni second transfert ni
   * second versement chez le fournisseur.
   */
  async acheminer(demande: {
    mouvementId: string;
    utilisateurId: number;
    montant: Money;
    compteConnecte: string;
  }): Promise<ResultatDeLAcheminement> {
    let transfertId: string;
    try {
      transfertId = await this.connect.transferer({
        montant: demande.montant,
        compteDestinataire: demande.compteConnecte,
        cleDIdempotence: `retrait-transfer:${demande.mouvementId}`,
        metadata: {
          retraitTxId: demande.mouvementId,
          userId: String(demande.utilisateurId),
        },
      });
    } catch (err) {
      this.logger.error(
        `Retrait Connect: transfert échoué tx=${demande.mouvementId}: ${message(err)}`,
      );
      return { issue: 'transfert-refuse', motif: message(err) };
    }

    return {
      issue: 'achemine',
      transfertId,
      versementId: await this.verserSiPossible(demande),
    };
  }

  /**
   * Le versement explicite, dont l'échec n'est pas un échec du retrait.
   *
   * @returns `undefined` quand le fournisseur l'a refusé — l'argent partira par
   *   son versement automatique.
   */
  private async verserSiPossible(demande: {
    mouvementId: string;
    montant: Money;
    compteConnecte: string;
  }): Promise<string | undefined> {
    try {
      return await this.connect.verser({
        montant: demande.montant,
        compteConnecte: demande.compteConnecte,
        cleDIdempotence: `retrait-payout:${demande.mouvementId}`,
        metadata: { retraitTxId: demande.mouvementId },
      });
    } catch (err) {
      this.logger.warn(
        `Retrait Connect: versement explicite non créé tx=${demande.mouvementId} ` +
          `(versement automatique probable): ${message(err)}`,
      );
      return undefined;
    }
  }
}

const message = (err: unknown): string =>
  err instanceof Error ? err.message : 'inconnu';

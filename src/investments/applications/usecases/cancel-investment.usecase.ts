import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import {
  CODE_RETRACTATION_DEJA_EFFECTUEE,
  CODE_RETRACTATION_INTROUVABLE,
  CODE_RETRACTATION_NON_PROPRIETAIRE,
  verifierEligibiliteRetractation,
} from 'src/investments/domains/retractation';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';

/**
 * Rétractation d'un investissement pendant le délai que BeOwn s'engage à
 * ouvrir aux investisseurs non avertis. Durée et libellé viennent de
 * `src/investments/domains/retractation.ts` : aucune valeur n'est écrite ici.
 *
 * ACCÈS. La route est authentifiée et réservée au rôle investisseur ; ce use
 * case ajoute la seule garde qui compte vraiment — la propriété de la
 * souscription. Un investisseur ne peut rétracter que la sienne.
 *
 * CODES D'ERREUR. Chaque refus porte un code stable (voir le domaine) pour que
 * le front distingue « trop tard » de « pas au bon statut » sans lire le
 * message français.
 *
 * Correctif H-B (double-remboursement) — tout le règlement vit dans UNE
 * transaction DB :
 *  1. verrou pessimiste sur la ligne investissement (sérialise les requêtes
 *     concurrentes de rétractation sur le même investissement) ;
 *  2. transition d'état CONDITIONNELLE `CONFIRME → RETRACTE` via un UPDATE
 *     gardé (`WHERE statut = 'confirme'`) dont on vérifie `affected === 1`
 *     AVANT de rembourser ;
 *  3. recrédit ATOMIQUE du wallet (`solde + :montant` en SQL) + trace ledger.
 *
 * Deux appels concurrents ne peuvent donc plus rembourser deux fois : le
 * second attend le verrou puis voit un statut déjà `RETRACTE` (0 ligne
 * affectée) et est rejeté sans effet de bord financier.
 */
@Injectable()
export class CancelInvestmentUseCase {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async execute(investmentId: string, userId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // 1. Verrou pessimiste sur l'investissement — sérialise les rétractations
      //    concurrentes sur la même ligne.
      const inv = await manager.findOne(InvestmentEntity, {
        where: { id: investmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inv) {
        throw new NotFoundException({
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'Investissement introuvable',
          code: CODE_RETRACTATION_INTROUVABLE,
        });
      }
      // Propriété de la souscription : un investisseur authentifié ne peut
      // rétracter que la sienne. Même corps d'erreur qu'un 403 de rôle, plus
      // un code exploitable.
      if (inv.utilisateurId !== userId) {
        throw new ForbiddenException({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          message: 'Vous ne pouvez annuler que vos propres investissements',
          code: CODE_RETRACTATION_NON_PROPRIETAIRE,
        });
      }

      const verdict = verifierEligibiliteRetractation({
        statut: inv.statut,
        echeance: inv.delaiRetractationJusquAu,
        maintenant: new Date(),
      });
      if (!verdict.autorisee) {
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: verdict.motif,
          code: verdict.code,
          expireLe: verdict.expireLe?.toISOString() ?? null,
        });
      }

      // 2. Transition d'état CONDITIONNELLE — claim atomique. Si une requête
      //    concurrente a déjà rétracté (affected === 0), on abandonne sans
      //    rembourser.
      const claim = await manager
        .createQueryBuilder()
        .update(InvestmentEntity)
        .set({ statut: InvestmentStatus.RETRACTE })
        .where('id = :id AND statut = :enAttente', {
          id: investmentId,
          enAttente: InvestmentStatus.EN_DELAI_RETRACTATION,
        })
        .execute();
      if (!claim.affected) {
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Investissement déjà rétracté ou non annulable',
          code: CODE_RETRACTATION_DEJA_EFFECTUEE,
        });
      }

      // 3. Recrédit ATOMIQUE du wallet investisseur.
      const montant = Number(inv.montant);
      const wallet = await manager.findOne(WalletEntity, {
        where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
      });
      if (!wallet) throw new NotFoundException('Wallet introuvable');

      // Le montant vivait sur `soldeBloque` depuis la souscription : la
      // rétractation le rend disponible « sans pénalité », donc sans aucune
      // retenue de frais — c'est l'engagement pris envers l'investisseur.
      await manager
        .createQueryBuilder()
        .update(WalletEntity)
        .set({
          solde: () => 'solde + :montant',
          soldeBloque: () => 'GREATEST(0, "soldeBloque" - :montant)',
        })
        .setParameter('montant', montant)
        .where('id = :id', { id: wallet.id })
        .execute();

      // Trace ledger du remboursement de rétractation (idempotent par
      // investissement : la contrainte unique verrouille tout doublon).
      // GRAND LIVRE — les fonds n'avaient jamais quitté le wallet de
      // l'investisseur : ils étaient sur sa poche bloquée le temps du délai. La
      // rétractation est donc un mouvement INTERNE au wallet (bloqué →
      // disponible) : source = destination, somme des fonds détenus conservée.
      await manager.save(
        TransactionEntity,
        manager.create(TransactionEntity, {
          walletSource: wallet.id,
          walletDestination: wallet.id,
          type: TransactionType.REMBOURSEMENT_CAPITAL,
          montant,
          devise: wallet.devise,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          investissementId: inv.id,
          projetId: inv.projetId,
          idempotencyKey: `retract:${inv.id}`,
          fraisPsp: 0,
          fraisPlateforme: 0,
          metadata: { kind: 'retractation', userId },
        }),
      );
    });
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentStatus, EcheanceStatus } from 'src/investments/domains/enums/investment-status.enum';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { PlatformFeesService } from 'src/common/platform-fees/platform-fees.service';
import { round2 } from 'src/common/platform-fees/platform-fees.constants';
import { formatEur } from 'src/shared/money/format-eur';
import { computeCoutAcquisition } from 'src/secondarymarket/domains/cout-acquisition';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import { SignatureProvider } from 'src/signatures/applications/ports/signature-provider.port';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import type { UserRepository } from 'src/iam/domains/ports/user.repository';
import { USER_REPOSITORY } from 'src/iam/domains/ports/user.repository';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

/**
 * Résultat de l'exécution atomique d'une signature `signature_request.done`.
 * Porte les données nécessaires aux effets de bord POST-transaction (PDF signé,
 * notifications) sans les exécuter dans la transaction.
 */
type SignatureDoneResult =
  | { branch: 'noop' }
  | {
      branch: 'investment';
      investment: InvestmentEntity;
      project: ProjectEntity | null;
      montant: number;
    }
  | { branch: 'secondary'; buyerInvestId: string; fusionnee: boolean };

/**
 * Règlement d'un contrat signé — extrait du presenter `YouSignWebhookController`
 * (SRP : le règlement atomique de la cession n'a rien à faire dans un
 * contrôleur HTTP, et il doit pouvoir être déclenché par PLUSIEURS chemins :
 * le webhook du prestataire ET l'acceptation certifiée du provider de repli).
 *
 * Le corps de `execute` est le déplacement VERBATIM de
 * `handleSignatureDone` : mêmes verrous, mêmes écritures grand-livre
 * (acheteur → vendeur brut, vendeur → plateforme frais), mêmes effets de bord.
 */
@Injectable()
export class FinalizeSignedContractUseCase {
  private readonly logger = new Logger(FinalizeSignedContractUseCase.name);

  constructor(
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    private readonly dataSource: DataSource,
    private readonly signatureProvider: SignatureProvider,
    private readonly notificationService: NotificationService,
    private readonly cloudStorage: CloudStorageService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly notificationEvents: NotificationEventService,
    private readonly platformFees: PlatformFeesService,
    private readonly metrics: MetricsPort,
  ) {}

  // ── Signature complète → finaliser la transaction (atomique) ─────────────────
  //
  // Invariant sécurité : la signature n'est marquée SIGNED qu'APRÈS l'exécution
  // complète, DANS la même transaction. La ligne signature est verrouillée
  // (pessimistic_write) puis relue SOUS VERROU : deux livraisons concurrentes du
  // webhook se sérialisent, la seconde voit un statut != PENDING et n'exécute
  // rien. Si une étape échoue, toute la transaction est annulée → la signature
  // reste PENDING → un rejeu du webhook ré-exécute (plus de « fire-and-forget »
  // qui laissait la signature SIGNED sur un traitement échoué).

  async execute(youSignRequestId: string): Promise<void> {
    const existing = await this.signatureRepo.findOne({
      where: { youSignRequestId },
    });
    if (!existing) {
      this.logger.warn(`No signature found for YouSign request ${youSignRequestId}`);
      return;
    }
    if (existing.statut !== SignatureStatus.PENDING) {
      this.logger.log(`Signature ${existing.id} already processed (${existing.statut})`);
      return;
    }

    // Snapshot des taux lu UNE fois pour toute l'opération marché secondaire
    // (cohérence R1 : pas de dérive si un admin modifie les commissions pendant
    // le traitement). Non requis pour la souscription initiale.
    const feeRates =
      existing.ordreId === null ? null : await this.platformFees.getRates();

    // Un règlement qui échoue laisse la signature PENDING (donc rejouable),
    // mais laisse SURTOUT deux personnes engagées sans rien savoir : le vendeur
    // a accepté, l'acheteur a signé, et rien ne s'est produit. L'incident est
    // donc annoncé aux deux parties et aux administrateurs avant d'être
    // propagé — la journalisation seule ne prévient personne.
    let result: SignatureDoneResult;
    try {
      result = await this.dataSource.transaction(async (em): Promise<SignatureDoneResult> => {
        // Verrou pessimiste sur la ligne signature + relecture du statut SOUS
        // VERROU : sérialise les livraisons concurrentes du webhook.
        const signature = await em.findOne(SignatureEntity, {
          where: { youSignRequestId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!signature || signature.statut !== SignatureStatus.PENDING) {
          return { branch: 'noop' };
        }

        // Souscription initiale (ordreId = null) → exécution atomique dédiée, puis
        // SIGNED en dernier dans la même transaction.
        if (signature.ordreId === null) {
          const out = await this.executeInvestmentSignature(em, signature);
          signature.statut = SignatureStatus.SIGNED;
          signature.signedAt = new Date();
          await em.save(SignatureEntity, signature);
          return out;
        }

        // ── Marché secondaire : rachat de fractions ───────────────────────────
        // VERROU sur l'annonce : le verrou de signature ne sérialise que les
        // livraisons du MÊME webhook. Deux signatures DISTINCTES ouvertes sur
        // la même annonce (remplissages partiels successifs) se réglaient
        // jusqu'ici en parallèle, chacune lisant l'annonce avant l'écriture de
        // l'autre — les mêmes fractions pouvaient être vendues deux fois.
        const ordre = await em.findOne(OrdreMarcheEntity, {
          where: { id: signature.ordreId! },
          relations: ['investissement'],
          lock: { mode: 'pessimistic_write' },
        });
        if (!ordre) throw new Error(`Ordre ${signature.ordreId} introuvable`);

        const nbFractions = signature.nbFractions!;
        const projetId = ordre.investissement.projetId;
        const prixUnitaire = Number(ordre.prixUnitaire);
        const montantTotal = round2(nbFractions * prixUnitaire);
        // Plus-value vendeur = prix de vente − coût d'acquisition des parts
        // vendues (coût moyen pondéré — voir domains/cout-acquisition.ts).
        // Calculée AVANT la réduction de l'investissement vendeur (étape 5).
        const coutAcquisition = computeCoutAcquisition(
          ordre.investissement,
          nbFractions,
          prixUnitaire,
        );
        const plusValueVendeur = round2(montantTotal - coutAcquisition);
        // Frais vendeur : % du montant de la vente + % de la plus-value.
        const { transactionFee, gainFee } = await this.platformFees.computeResaleFees(
          montantTotal,
          plusValueVendeur,
          // Non-null dans la branche marché secondaire (ordreId != null).
          feeRates!,
        );
        const totalFrais = round2(transactionFee + gainFee);
        const montantNetVendeur = round2(montantTotal - totalFrais);
        const buyerUserId = signature.userId;

        // 1. Vérifier/obtenir wallet acheteur.
        //    Les fonds ont normalement été RÉSERVÉS à l'acceptation du vendeur
        //    (CessionCompensationService) : ils se trouvent en `soldeBloque`.
        //    C'est donc la somme des deux poches qui doit couvrir la cession.
        // Les DEUX portefeuilles sont verrouillés d'un coup, dans l'ordre
        // croissant de leur identifiant. Les verrouiller l'un après l'autre
        // dans l'ordre du code — acheteur puis vendeur — interbloquerait deux
        // cessions croisées (A vend à B pendant que B vend à A) : chacune
        // tiendrait le portefeuille que l'autre attend. Un ordre total, le
        // même pour toutes les transactions, rend l'interblocage impossible.
        const portefeuilles = await this.verrouillerWalletsOrdonnes(em, [
          { userId: buyerUserId, absent: `Wallet acheteur ${buyerUserId} introuvable` },
          {
            userId: ordre.vendeurId,
            absent: `Wallet vendeur ${ordre.vendeurId} introuvable : règlement impossible sans contrepartie créditée`,
          },
        ]);
        const buyerWallet = portefeuilles.get(buyerUserId)!;
        const buyerBloque = Number(buyerWallet.soldeBloque ?? 0);
        const buyerDisponible = Number(buyerWallet.solde);
        if (round2(buyerBloque + buyerDisponible) < montantTotal) {
          throw new Error(
            `Fonds insuffisants pour acheteur ${buyerUserId}: bloqué ${buyerBloque} + disponible ${buyerDisponible} < ${montantTotal}`,
          );
        }

        // 2. Wallet vendeur — EXIGÉ, jamais optionnel.
        //    Un crédit vendeur conditionnel faisait disparaître l'argent en
        //    silence : l'acheteur était débité, les frais encaissés, et la
        //    contrepartie du vendeur n'était simplement pas écrite. Un vendeur
        //    sans portefeuille est une anomalie de données — elle doit annuler la
        //    transaction et laisser la signature PENDING (donc rejouable), pas
        //    produire une cession déséquilibrée.
        const sellerWallet = portefeuilles.get(ordre.vendeurId)!;

        // 3. Cas A (investi) ou Cas B (nouvel investissement)
        let buyerInvest: InvestmentEntity;
        const existingInvest = signature.investmentId
          ? await em.findOne(InvestmentEntity, { where: { id: signature.investmentId } })
          : null;

        if (existingInvest) {
          // Écriture RELATIVE : `nbTitres = nbTitres + :n` est calculé par la
          // base. La forme absolue (`lire, additionner en mémoire, réécrire`)
          // perdait silencieusement toute écriture concurrente survenue entre
          // la lecture et l'enregistrement — typiquement un second
          // remplissage sur la même position d'acheteur.
          const ajout = await em
            .createQueryBuilder()
            .update(InvestmentEntity)
            .set({
              nbTitres: () => '"nbTitres" + :n',
              montant: () => 'montant + :m',
              signatureId: signature.id,
            })
            .setParameters({ n: nbFractions, m: montantTotal })
            .where('id = :id', { id: existingInvest.id })
            .execute();
          if (!ajout.affected) {
            throw new Error(
              `Position acheteur ${existingInvest.id} introuvable au moment du crédit`,
            );
          }
          buyerInvest = (await em.findOne(InvestmentEntity, {
            where: { id: existingInvest.id },
          }))!;
        } else {
          const sellerInvest = ordre.investissement;
          const newInvest = em.create(InvestmentEntity, {
            projetId,
            utilisateurId: buyerUserId,
            montant: montantTotal,
            instrument: sellerInvest.instrument,
            nbTitres: nbFractions,
            valeurTitre: prixUnitaire,
            statut: InvestmentStatus.CONFIRME,
            signatureId: signature.id,
          });
          buyerInvest = await em.save(InvestmentEntity, newInvest);
        }

        // 4. Lier le document au bon investissement
        if (signature.documentId) {
          await em.update(DocumentEntity, { id: signature.documentId }, {
            investmentId: buyerInvest.id,
          });
        }

        // 5. Réduire la position du vendeur.
        //    Le montant est décrémenté du COÛT D'ACQUISITION des parts cédées,
        //    jamais de leur prix de vente : `montant / nbTitres` reste ainsi
        //    égal au coût moyen d'origine, et la plus-value de la cession
        //    SUIVANTE reste juste. Décrémenter du prix de vente déplaçait le
        //    coût moyen à chaque cession partielle et faussait durablement
        //    l'assiette des frais sur gain (voir domains/cout-acquisition.ts).
        const sellerInvest = await em.findOne(InvestmentEntity, {
          where: { id: ordre.investissementId },
          lock: { mode: 'pessimistic_write' },
        });
        if (sellerInvest && sellerInvest.nbTitres != null) {
          const remaining = Number(sellerInvest.nbTitres) - nbFractions;

          // ÉCRITURE RELATIVE ET CONDITIONNELLE — c'est LA garde anti
          // double-vente. `nbTitres >= :n` est évalué par la base au moment de
          // l'écriture : si un règlement concurrent a déjà consommé les
          // fractions, `affected` vaut 0 et TOUTE la transaction est annulée.
          //
          // La forme absolue précédente écrivait `Math.max(0, remaining)` à
          // partir d'une lecture antérieure : deux règlements concurrents
          // lisaient tous deux 10 fractions, écrivaient tous deux 0, et le
          // vendeur livrait vingt fractions qu'il n'avait pas. Le `Math.max`
          // ne protégeait pas — il MASQUAIT le découvert en le ramenant à zéro.
          const retrait = await em
            .createQueryBuilder()
            .update(InvestmentEntity)
            .set(
              remaining > 0
                ? {
                    nbTitres: () => '"nbTitres" - :n',
                    montant: () => 'montant - :cout',
                  }
                : { nbTitres: () => '"nbTitres" - :n', montant: 0 },
            )
            .setParameters({ n: nbFractions, cout: coutAcquisition })
            .where('id = :id AND "nbTitres" >= :n', {
              id: sellerInvest.id,
              n: nbFractions,
            })
            .execute();

          if (!retrait.affected) {
            throw new Error(
              `Position vendeur ${sellerInvest.id} insuffisante : ${nbFractions} fraction(s) ` +
                'déjà cédées par un règlement concurrent — cession annulée.',
            );
          }
        }

        // 6. Mettre à jour l'ordre.
        //    Fill TOTAL → l'annonce est servie : EXECUTE, acheteur inscrit.
        //    Fill PARTIEL → le reliquat doit RETOURNER AU CARNET. Le passer en
        //    EXECUTE gelait les fractions non vendues à vie : elles restaient
        //    décomptées de la position du vendeur comme « engagées » alors
        //    qu'aucune annonce vivante ne les portait plus. On republie donc le
        //    reliquat et on purge la marque d'intérêt déjà servie, faute de quoi
        //    l'annonce reviendrait au carnet en portant encore son acheteur.
        //    Transition CONDITIONNELLE sur le statut lu sous verrou : une
        //    annonce déjà servie, annulée ou expirée par un autre chemin n'est
        //    jamais réécrite. La quantité restante est décrémentée par la BASE
        //    (`nbFractions - :n`), jamais recalculée en mémoire.
        const transition =
          nbFractions >= ordre.nbFractions
            ? em
                .createQueryBuilder()
                .update(OrdreMarcheEntity)
                .set({
                  acheteurId: buyerUserId,
                  statut: OrdreMarcheStatus.EXECUTE,
                })
                .where('id = :id AND statut = :attendu AND "nbFractions" <= :n', {
                  id: ordre.id,
                  attendu: ordre.statut,
                  n: nbFractions,
                })
            : em
                .createQueryBuilder()
                .update(OrdreMarcheEntity)
                .set({
                  nbFractions: () => '"nbFractions" - :n',
                  montant: () => 'montant - :m',
                  statut: OrdreMarcheStatus.EN_CARNET,
                  acheteurId: null,
                  interetNbFractions: null,
                  interetExprimeLe: null,
                })
                .setParameters({ n: nbFractions, m: montantTotal })
                .where('id = :id AND statut = :attendu AND "nbFractions" > :n', {
                  id: ordre.id,
                  attendu: ordre.statut,
                  n: nbFractions,
                });

        const ordreMisAJour = await transition.execute();
        if (!ordreMisAJour.affected) {
          throw new Error(
            `Annonce ${ordre.id} déjà servie ou modifiée par un règlement concurrent — cession annulée.`,
          );
        }

        // 7. Consommer les fonds de l'acheteur.
        //    Priorité à `soldeBloque` : c'est la réservation posée à
        //    l'acceptation qui est ici consommée. Le repli sur le solde
        //    disponible ne sert qu'aux signatures ouvertes AVANT l'existence de
        //    la réservation ; dans les deux cas les fonds détenus par le wallet
        //    (solde + soldeBloque) diminuent exactement du montant de la cession.
        const prisSurBloque = Math.min(buyerBloque, montantTotal);
        const prisSurDisponible = round2(montantTotal - prisSurBloque);
        if (prisSurDisponible > 0) {
          this.logger.warn(
            `Cession ${ordre.id} : ${prisSurDisponible} prélevés hors réservation ` +
              `(bloqué ${buyerBloque} < ${montantTotal}) — signature antérieure à la réservation des fonds`,
          );
        }
        // Débit RELATIF ET CONDITIONNEL des deux poches. La forme absolue
        // réécrivait le portefeuille à partir de valeurs lues plus haut : tout
        // mouvement concurrent survenu entre-temps était écrasé sans bruit.
        const debitAcheteur = await em
          .createQueryBuilder()
          .update(WalletEntity)
          .set({
            solde: () => 'solde - :dispo',
            soldeBloque: () => '"soldeBloque" - :bloque',
          })
          .setParameters({ dispo: prisSurDisponible, bloque: prisSurBloque })
          .where(
            'id = :id AND solde >= :dispo AND "soldeBloque" >= :bloque',
            { id: buyerWallet.id, dispo: prisSurDisponible, bloque: prisSurBloque },
          )
          .execute();
        if (!debitAcheteur.affected) {
          throw new Error(
            `Fonds acheteur ${buyerUserId} insuffisants au moment du débit ` +
              `(disponible ${prisSurDisponible} / bloqué ${prisSurBloque}) — cession annulée.`,
          );
        }

        // 8. Créditer wallet vendeur (net des frais vendeur)
        const creditVendeur = await em
          .createQueryBuilder()
          .update(WalletEntity)
          .set({ solde: () => 'solde + :net' })
          .setParameter('net', montantNetVendeur)
          .where('id = :id', { id: sellerWallet.id })
          .execute();
        if (!creditVendeur.affected) {
          throw new Error(
            `Portefeuille vendeur ${sellerWallet.id} introuvable au moment du crédit`,
          );
        }

        // 9. Créditer wallet plateforme (frais de transaction + frais sur gain)
        // Wallet system-wide, créé à la volée si absent (parité avec SEQUESTRE_IR/CSG).
        let platformWallet: WalletEntity | null = null;
        if (totalFrais > 0) {
          platformWallet = await em.findOne(WalletEntity, {
            where: { type: WalletType.FRAIS_PLATEFORME },
          });
          if (!platformWallet) {
            platformWallet = await em.save(
              WalletEntity,
              em.create(WalletEntity, {
                type: WalletType.FRAIS_PLATEFORME,
                proprietaireUserId: null,
                fournisseurRef: 'PLAT-FEES-001',
                devise: buyerWallet.devise,
                solde: 0,
              }),
            );
          }
          await em
            .createQueryBuilder()
            .update(WalletEntity)
            .set({ solde: () => 'solde + :frais' })
            .setParameter('frais', totalFrais)
            .where('id = :id', { id: platformWallet.id })
            .execute();
        }

        // 10. Transaction ledger acheteur
        const txBuyer = em.create(TransactionEntity, {
          walletSource: buyerWallet.id,
          walletDestination: sellerWallet.id,
          type: TransactionType.SOUSCRIPTION,
          montant: montantTotal,
          devise: buyerWallet.devise,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          investissementId: buyerInvest.id,
          projetId,
          idempotencyKey: `rachat:buyer:${signature.id}`,
          fraisPsp: 0,
          fraisPlateforme: totalFrais,
        });
        await em.save(TransactionEntity, txBuyer);

        // 11. (SUPPRIMÉ) — il existait ici une seconde écriture ∅ → vendeur du
        // montant NET, EN PLUS du paiement acheteur → vendeur ci-dessus : le
        // vendeur était compté deux fois au grand livre (écart = montant total
        // à chaque cession réglée) et de l'argent entrait au registre depuis
        // l'extérieur sans mouvement réel. La comptabilité juste tient en deux
        // temps : l'acheteur paie le BRUT au vendeur (écriture 10), puis les
        // frais quittent le vendeur vers la plateforme (écritures 12) — le net
        // vendeur est la RÉSULTANTE, pas une écriture. Repéré par le garde-fou
        // de rapprochement du seed, confirmé contre `rapprocherGrandLivre`.

        // 12. Transactions ledger frais plateforme — une par frais.
        // Clés scoppées par signature (un ordre peut être exécuté en plusieurs
        // fills partiels) ; metadata.ordreId permet le lookup au reverse admin.
        if (platformWallet && transactionFee > 0) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              // Source = VENDEUR : les frais sont retenus sur son brut (il a
              // reçu le total à l'écriture 10). Une source ∅ créerait l'argent
              // des frais depuis l'extérieur et fausserait son rapprochement.
              walletSource: sellerWallet.id,
              walletDestination: platformWallet.id,
              type: TransactionType.SOUSCRIPTION,
              montant: transactionFee,
              devise: platformWallet.devise,
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.INTERNE,
              investissementId: ordre.investissementId,
              projetId,
              idempotencyKey: `secmarket:fee:revente_transaction:sig:${signature.id}`,
              fraisPsp: 0,
              fraisPlateforme: 0,
              metadata: {
                source: 'revente_transaction',
                ordreId: ordre.id,
                signatureId: signature.id,
              },
            }),
          );
        }
        if (platformWallet && gainFee > 0) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              // Même raison que le frais de transaction : retenu sur le brut
              // du vendeur, jamais créé depuis l'extérieur.
              walletSource: sellerWallet.id,
              walletDestination: platformWallet.id,
              type: TransactionType.SOUSCRIPTION,
              montant: gainFee,
              devise: platformWallet.devise,
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.INTERNE,
              investissementId: ordre.investissementId,
              projetId,
              idempotencyKey: `secmarket:fee:gain_revente_actions:sig:${signature.id}`,
              fraisPsp: 0,
              fraisPlateforme: 0,
              metadata: {
                source: 'gain_revente_actions',
                ordreId: ordre.id,
                signatureId: signature.id,
                plusValueVendeur,
                coutAcquisition,
              },
            }),
          );
        }

        // Statut SIGNED posé en DERNIER, dans la même transaction que l'exécution.
        signature.statut = SignatureStatus.SIGNED;
        signature.signedAt = new Date();
        await em.save(SignatureEntity, signature);

        // Émission APRÈS le dernier `em.save` de la transaction : si tout ce qui
        // précède a réussi, le callback va se résoudre et TypeORM va commit — ces
        // incréments ne peuvent donc pas survivre à un rollback (cf. contrat du
        // MetricsPort : jamais bloquant, jamais dans le chemin d'erreur).
        this.metrics.incrementCounter(METRIC.SECONDARY_ORDERS_TOTAL, { action: 'executed' });
        this.metrics.observeHistogram(METRIC.SECONDARY_ORDER_AMOUNT_EUR, montantTotal, {
          action: 'executed',
        });
        if (transactionFee > 0) {
          this.metrics.observeHistogram(METRIC.SECONDARY_FEES_EUR, transactionFee, {
            source: 'revente_transaction',
          });
        }
        if (gainFee > 0) {
          this.metrics.observeHistogram(METRIC.SECONDARY_FEES_EUR, gainFee, {
            source: 'gain_revente_actions',
          });
        }

        return { branch: 'secondary', buyerInvestId: buyerInvest.id, fusionnee: !!existingInvest };
      });
    } catch (err) {
      await this.notifierEchecReglement(existing, err);
      throw err;
    }

    // ── Effets de bord best-effort, HORS transaction ──────────────────────────
    if (result.branch === 'investment') {
      await this.finalizeInvestmentSideEffects(
        existing,
        result.investment,
        result.project,
        result.montant,
      );
      return;
    }
    if (result.branch !== 'secondary') return;

    // Alias : réutilise verbatim le bloc d'effets de bord marché secondaire.
    const signature = existing;
    const { buyerInvestId, fusionnee } = result;

    // Remplacer le PDF unsigné par la version signée YouSign (parité avec
    // l'investissement primaire) — l'acheteur voit ainsi son vrai contrat de
    // Cession dans "Mes Investissements".
    try {
      if (signature.documentId) {
        const signedPdf = await this.signatureProvider.downloadSignedDocument(signature.youSignRequestId);
        const filename = `contrat_cession_${buyerInvestId.slice(0, 8)}_${signature.userId}_${Date.now()}.pdf`;
        const { objectName, publicUrl } = await this.cloudStorage.upload(
          signedPdf,
          filename,
          'application/pdf',
          'contrats',
        );
        await this.documentRepo.update(
          { id: signature.documentId },
          { filename: objectName, path: publicUrl, originalName: filename, sizeBytes: signedPdf.length },
        );
      }
    } catch (err: any) {
      this.logger.warn(`Could not store signed cession PDF for investment ${buyerInvestId}: ${err?.message}`);
    }

    // Notifications (non-bloquantes)
    const ordre = await this.ordreRepo.findOne({
      where: { id: signature.ordreId! },
      relations: ['investissement'],
    });
    const nbFractions = signature.nbFractions!;

    if (ordre) {
      this.notificationService.push({
        utilisateurId: ordre.vendeurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Vente exécutée',
        message: `${nbFractions} fraction${nbFractions > 1 ? 's' : ''} ont été achetées et le paiement a été crédité sur votre wallet.`,
        metadata: { ordreId: ordre.id, nbFractions },
      }).catch(() => {});

      this.notificationService
        .pushToAdmins({
          type: NotificationType.MARCHE_SECONDAIRE,
          titre: 'Vente marché secondaire',
          message: `User #${signature.userId} a acheté ${nbFractions} fraction(s) à User #${ordre.vendeurId}.`,
          roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
          metadata: { ordreId: ordre.id, buyerInvestId, sellerId: ordre.vendeurId, buyerId: signature.userId, nbFractions },
        })
        .catch(() => {});

      const projectEntity = await this.projectRepo.findOne({
        where: { id: ordre.investissement.projetId },
      });
      const buyerUser = await this.userRepository.findById(signature.userId);
      const sellerUser = await this.userRepository.findById(ordre.vendeurId);
      if (projectEntity && buyerUser && sellerUser) {
        await this.notificationEvents.secondaryTradeExecuted(
          ordre, projectEntity, buyerUser, sellerUser, nbFractions,
        );
      }
    }

    this.logger.log(`Signature done: investmentId=${buyerInvestId} fusionnee=${fusionnee}`);
  }

  // ── Souscription initiale signée → débiter + confirmer (exécution atomique) ──
  //
  // Exécuté DANS la transaction de execute (manager `em` partagé) :
  // débit du wallet, confirmation, écheances et transition FINANCE sont annulés
  // ensemble si une étape échoue — la signature reste alors PENDING.

  /**
   * Verrouille en écriture les portefeuilles INVESTISSEUR des comptes donnés,
   * dans l'ordre CROISSANT de leur identifiant.
   *
   * L'ordre est le point important : verrouiller dans l'ordre d'apparition du
   * code (acheteur puis vendeur) interbloque deux cessions croisées — A vend à
   * B pendant que B vend à A, chacune tenant le portefeuille que l'autre
   * attend. Un ordre total, identique pour toutes les transactions, rend
   * l'interblocage structurellement impossible.
   *
   * Les identifiants sont d'abord résolus sans verrou (une lecture par
   * compte), puis re-lus verrouillés dans le bon ordre : c'est la seule façon
   * de connaître l'ordre avant de prendre les verrous.
   */
  private async verrouillerWalletsOrdonnes(
    em: EntityManager,
    comptes: ReadonlyArray<{ userId: number; absent: string }>,
  ): Promise<Map<number, WalletEntity>> {
    const resolus: Array<{ userId: number; id: string }> = [];
    for (const compte of comptes) {
      const wallet = await em.findOne(WalletEntity, {
        where: {
          proprietaireUserId: compte.userId,
          type: WalletType.INVESTISSEUR,
        },
        select: ['id'],
      });
      if (!wallet) throw new Error(compte.absent);
      resolus.push({ userId: compte.userId, id: wallet.id });
    }

    const parUtilisateur = new Map<number, WalletEntity>();
    for (const { userId, id } of [...resolus].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )) {
      const verrouille = await em.findOne(WalletEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!verrouille) {
        throw new Error(
          comptes.find((c) => c.userId === userId)?.absent ??
            `Wallet ${id} introuvable`,
        );
      }
      parUtilisateur.set(userId, verrouille);
    }
    return parUtilisateur;
  }

  private async executeInvestmentSignature(
    em: EntityManager,
    signature: SignatureEntity,
  ): Promise<SignatureDoneResult> {
    const investment = await em.findOne(InvestmentEntity, {
      where: { id: signature.investmentId! },
    });
    if (!investment) {
      this.logger.warn(`Investment ${signature.investmentId} not found for signature ${signature.id}`);
      return { branch: 'noop' };
    }
    if (investment.statut !== InvestmentStatus.INITIE) {
      this.logger.log(`Investment ${investment.id} already processed (${investment.statut})`);
      return { branch: 'noop' };
    }

    const project = await em.findOne(ProjectEntity, { where: { id: investment.projetId } });
    const montant = Number(investment.montant);
    // Frais configurables : AUCUN frais d'entrée à la souscription — le
    // wallet est débité exactement du montant investi. (L'ancien frais
    // d'entrée 2 % Phase 9 est supprimé ; la plateforme se rémunère sur les
    // distributions, la sortie et le marché secondaire.)

    const wallet = await em.findOne(WalletEntity, {
      where: { proprietaireUserId: investment.utilisateurId, type: WalletType.INVESTISSEUR },
    });
    if (!wallet) throw new Error(`Wallet introuvable pour user ${investment.utilisateurId}`);
    if (Number(wallet.solde) < montant) {
      throw new Error(
        `Solde insuffisant pour souscription : ${wallet.solde} < ${montant}`,
      );
    }

    // Confirmer l'investissement
    investment.statut = InvestmentStatus.CONFIRME;
    investment.signatureId = signature.id;
    await em.save(InvestmentEntity, investment);

    // Débiter wallet (montant investi, sans frais)
    wallet.solde = Number(wallet.solde) - montant;
    await em.save(WalletEntity, wallet);

    // Transaction ledger principale (souscription).
    //
    // DIVERGENCE CONNUE avec le parcours réel (create-investment.usecase) :
    // ici le wallet PROJET n'est jamais crédité — l'argent sort de
    // l'investisseur vers l'extérieur (destination ∅), la collecte du projet
    // ne voit rien passer. Chemin aujourd'hui MORT (POST /investments/initiate
    // répond 410) : avant toute réactivation, cette branche doit adopter
    // ResolveProjectWalletUseCase et créditer le wallet technique du projet,
    // exactement comme le parcours réel. Ne pas réactiver en l'état.
    const tx = em.create(TransactionEntity, {
      walletSource: wallet.id,
      walletDestination: null,
      type: TransactionType.SOUSCRIPTION,
      montant,
      devise: wallet.devise,
      statut: TransactionStatus.REUSSI,
      fournisseur: TransactionFournisseur.INTERNE,
      investissementId: investment.id,
      projetId: investment.projetId,
      idempotencyKey: `invest:${investment.utilisateurId}:${investment.id}`,
      fraisPsp: 0,
      fraisPlateforme: 0,
    });
    await em.save(TransactionEntity, tx);

    // Générer les écheances (in_fine par défaut) — MODÈLE OBLIGATAIRE UNIQUEMENT.
    //
    // Les deux moteurs de rendement s'excluent : un projet EQUITY rémunère
    // exclusivement par les distributions de loyers réels
    // (CalculateDistributionPeriodeUseCase) et par la cession
    // (DeclareSortieUseCase). Lui générer en plus un échéancier de coupons
    // calculé sur `triCible` ferait compter deux fois le rendement dû à
    // l'investisseur.
    if (project && this.genereEcheancierDeCoupons(project)) {
      const echeances = this.buildEcheances(
        investment.id,
        montant,
        Number(project.triCible ?? 0),
        Number(project.dureeMois),
      );
      await em.save(EcheanceEntity, echeances);
    }

    // Auto-transition FINANCE si toutes les fractions sont vendues
    if (project) {
      const prixFraction = Number(project.ticketMinimum);
      const nbFractionsTotal = project.nbFractions ?? Math.floor(Number(project.capitalCible) / prixFraction);
      const totalVendues = await em
        .createQueryBuilder(InvestmentEntity, 'inv')
        .select('COALESCE(SUM(inv.nbTitres), 0)', 'total')
        .where('inv.projetId = :projetId', { projetId: investment.projetId })
        .andWhere('inv.statut NOT IN (:...excluded)', {
          excluded: [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE, InvestmentStatus.INITIE],
        })
        .getRawOne()
        .then((r) => Number(r?.total ?? 0));

      if (totalVendues >= nbFractionsTotal) {
        await em.update(ProjectEntity, { id: investment.projetId }, { statut: ProjectStatus.FINANCE });
      }
    }

    return { branch: 'investment', investment, project, montant };
  }

  // ── Souscription initiale : effets de bord (PDF signé + notifications) ───────

  private async finalizeInvestmentSideEffects(
    signature: SignatureEntity,
    investment: InvestmentEntity,
    project: ProjectEntity | null,
    montant: number,
  ): Promise<void> {
    // Replace unsigned PDF with the signed version from YouSign
    try {
      const signedPdf = await this.signatureProvider.downloadSignedDocument(signature.youSignRequestId);
      const filename = `contrat_signe_${investment.id.slice(0, 8)}_${investment.utilisateurId}_${Date.now()}.pdf`;
      const { objectName, publicUrl } = await this.cloudStorage.upload(signedPdf, filename, 'application/pdf', 'contrats');
      if (signature.documentId) {
        await this.documentRepo.update(
          { id: signature.documentId },
          { filename: objectName, path: publicUrl, originalName: filename, sizeBytes: signedPdf.length },
        );
      }
    } catch (err: any) {
      this.logger.warn(`Could not store signed PDF for investment ${investment.id}: ${err?.message}`);
    }

    // Notify via facade (handles both user + admin)
    const user = await this.userRepository.findById(investment.utilisateurId);
    if (project && user) {
      this.notificationEvents.investmentCreated(investment, project, user);
    }

    this.notificationService
      .pushToAdmins({
        type: NotificationType.INVESTISSEMENT,
        titre: 'Nouvel investissement',
        message: `User #${investment.utilisateurId} a investi ${formatEur(montant)} dans "${project?.titre ?? 'projet'}".`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
        metadata: { investissementId: investment.id, projetId: investment.projetId, montant, userId: investment.utilisateurId },
      })
      .catch(() => {});

    this.logger.log(`Investment signature done: investmentId=${investment.id} userId=${investment.utilisateurId}`);
  }

  /**
   * Un échéancier de coupons n'est dû que par le moteur OBLIGATAIRE.
   *
   * Repli sur `obligataire` quand la colonne est absente ou nulle (lignes
   * antérieures à l'ajout du champ) : le comportement historique est préservé
   * à l'identique, seul le modèle EQUITY change de traitement.
   */
  private genereEcheancierDeCoupons(project: ProjectEntity): boolean {
    const modele = project.modeleEconomique ?? ModeleEconomique.OBLIGATAIRE;
    return modele === ModeleEconomique.OBLIGATAIRE;
  }

  private buildEcheances(
    investissementId: string,
    montant: number,
    triAnnuel: number,
    dureeMois: number,
  ): Partial<EcheanceEntity>[] {
    const tauxMensuel = triAnnuel / 100 / 12;
    const now = new Date();
    const echeances: Partial<EcheanceEntity>[] = [];

    for (let i = 1; i <= dureeMois; i++) {
      const datePrevue = new Date(now);
      datePrevue.setMonth(datePrevue.getMonth() + i);
      echeances.push({
        investissementId,
        numero: i,
        datePrevue,
        montantCapital: i === dureeMois ? montant : 0,
        montantInterets: Math.round(montant * tauxMensuel * 100) / 100,
        montantTotal: (i === dureeMois ? montant : 0) + Math.round(montant * tauxMensuel * 100) / 100,
        statut: EcheanceStatus.A_VENIR,
        payeLe: null,
      });
    }
    return echeances;
  }

  // ── Règlement impossible → prévenir les personnes engagées ──────────────────

  /**
   * Un règlement de cession qui échoue est un incident À DEUX PARTIES : le
   * vendeur a donné son accord, l'acheteur a signé, ses fonds sont réservés, et
   * pourtant rien ne s'exécute. Les deux doivent l'apprendre autrement qu'en
   * constatant l'absence de mouvement, et les administrateurs doivent pouvoir
   * intervenir.
   *
   * Best-effort de bout en bout : notifier ne doit jamais masquer l'erreur
   * d'origine, qui est propagée par l'appelant.
   */
  private async notifierEchecReglement(
    signature: SignatureEntity,
    erreur: unknown,
  ): Promise<void> {
    if (!signature.ordreId) return; // souscription initiale : hors périmètre

    const motif = erreur instanceof Error ? erreur.message : String(erreur);
    try {
      const ordre = await this.ordreRepo.findOne({
        where: { id: signature.ordreId },
      });
      if (!ordre) return;

      const message =
        'Le règlement de la cession n\'a pas pu être finalisé. Aucun mouvement ' +
        "n'a été enregistré et rien n'est perdu : nos équipes ont été alertées " +
        'et reprennent le dossier.';
      const metadata = {
        ordreId: ordre.id,
        signatureId: signature.id,
        nbFractions: signature.nbFractions,
      };

      await Promise.all([
        this.notificationService
          .push({
            utilisateurId: signature.userId,
            type: NotificationType.MARCHE_SECONDAIRE,
            titre: 'Règlement de votre achat interrompu',
            message,
            metadata,
          })
          .catch(() => {}),
        this.notificationService
          .push({
            utilisateurId: ordre.vendeurId,
            type: NotificationType.MARCHE_SECONDAIRE,
            titre: 'Règlement de votre vente interrompu',
            message,
            metadata,
          })
          .catch(() => {}),
        this.notificationService
          .pushToAdmins({
            type: NotificationType.MARCHE_SECONDAIRE,
            titre: 'Échec de règlement — marché secondaire',
            message:
              `Cession ${ordre.id} non réglée (acheteur #${signature.userId}, vendeur #${ordre.vendeurId}) : ${motif}`,
            roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
            metadata: { ...metadata, motif },
          })
          .catch(() => {}),
      ]);
    } catch (err: any) {
      this.logger.warn(
        `Notification d'échec de règlement non remise pour la signature ${signature.id}: ${err?.message}`,
      );
    }
  }
}

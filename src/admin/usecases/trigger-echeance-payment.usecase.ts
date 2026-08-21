import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { formatEur } from 'src/common/money/format-eur';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import {
  EcheanceStatus,
  InvestmentStatus,
} from 'src/investments/domains/enums/investment-status.enum';
import { PayEcheanceUseCase } from 'src/investments/applications/usecases/pay-echeance.usecase';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';

/**
 * Déclenche manuellement le paiement d'une échéance (numero) pour tous les
 * investisseurs confirmés d'un projet.
 *
 * Correctif M-4 — ce use case ne règle plus lui-même l'échéance. Il DÉLÈGUE
 * chaque paiement à {@link PayEcheanceUseCase} (le chemin durci H-C, partagé
 * avec la route `/pay` et le CRON), qui garantit un règlement :
 *  - ATOMIQUE : claim conditionnel de l'échéance + crédit SQL `solde + :x`
 *    (fini le read-modify-write sujet au lost-update) ;
 *  - FISCALEMENT CORRECT : PFU 30 % (IR 12,8 % + CSG 17,2 %) prélevé vers les
 *    wallets séquestres, comme sur tous les autres chemins de paiement.
 *
 * Ainsi il n'existe plus qu'UNE seule logique de paiement d'échéance : les deux
 * boutons admin (`/pay` unitaire et `/trigger-payment` de masse) produisent des
 * écritures identiques, ce qui supprime la divergence de traitement fiscal.
 *
 * L'autorisation (`assertPay`) reste portée par le contrôleur.
 */
@Injectable()
export class TriggerEcheancePaymentUseCase {
  private readonly logger = new Logger(TriggerEcheancePaymentUseCase.name);

  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    private readonly payEcheance: PayEcheanceUseCase,
    private readonly notifications: NotificationService,
  ) {}

  async execute(
    projectId: string,
    numero: number,
    admin: ActiveUser,
  ): Promise<{ paidCount: number; totalAmount: number; skipped: number }> {
    if (numero < 1) throw new BadRequestException("Numéro d'échéance invalide");

    // 1. Charger les investissements confirmés du projet
    const investments = await this.investRepo.find({
      where: { projetId: projectId, statut: InvestmentStatus.CONFIRME },
    });
    if (investments.length === 0) {
      throw new NotFoundException('Aucun investissement confirmé sur ce projet');
    }

    const investmentIds = investments.map((i) => i.id);

    // 2. Trouver les échéances correspondantes
    const echeances = await this.echeanceRepo.find({
      where: { investissementId: In(investmentIds), numero },
    });
    if (echeances.length === 0) {
      throw new NotFoundException(`Aucune échéance #${numero} trouvée pour ce projet`);
    }

    let paidCount = 0;
    let totalAmount = 0;
    let skipped = 0;

    // 3. Déléguer chaque règlement au chemin durci (atomique + PFU). La sécurité
    //    d'idempotence/concurrence est portée par le claim conditionnel de
    //    PayEcheanceUseCase ; on court-circuite juste les échéances déjà payées
    //    pour éviter une transaction inutile.
    for (const ech of echeances) {
      if (ech.statut === EcheanceStatus.PAYE) {
        skipped++;
        continue;
      }

      try {
        const paid = await this.payEcheance.execute(
          ech.id,
          admin.userId,
          admin.role,
          'trigger_masse',
        );
        paidCount++;
        totalAmount += Number(paid.montantTotal);
      } catch (err: any) {
        // Déjà payée par un run concurrent, statut non payable, ou wallet
        // introuvable → ignorée sans faire échouer le lot, mais journalisée :
        // sur un chemin monétaire, un skip ne doit jamais masquer une vraie
        // erreur de règlement (wallet manquant, panne DB) en la confondant
        // avec un no-op « déjà payée ».
        this.logger.warn(
          `Échéance ${ech.id} non réglée (ignorée) lors du déclenchement ` +
          `#${numero} projet=${projectId}: ${err?.message ?? err}`,
        );
        skipped++;
      }
    }

    this.notifications
      .pushToAdmins({
        type: NotificationType.ECHEANCE,
        titre: `Échéance #${numero} déclenchée`,
        message: `Admin a déclenché l'échéance ${numero} : ${paidCount} investisseur(s) crédité(s) pour ${formatEur(totalAmount)}.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
        metadata: { projectId, numero, paidCount, totalAmount, triggeredBy: admin.userId },
      })
      .catch(() => {});

    return { paidCount, totalAmount, skipped };
  }
}

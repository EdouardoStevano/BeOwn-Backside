import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectAccountReader,
  type ConnectAccountStatus,
} from '../ports/connect-account.port';
import {
  InstantBalanceView,
  PayoutMethodError,
  PayoutMethodView,
  PayoutMethodsReader,
  PayoutMethodsWriter,
} from '../ports/payout-methods.port';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

/**
 * Cas d'usage « destinations de retrait de l'investisseur » (Lot 4a).
 *
 * SRP : toute la logique métier des routes `/payments/connect/payout-methods`
 * et `/payments/connect/instant-balance` vit ici ; le contrôleur ne fait que du
 * HTTP.
 *
 * SÉCURITÉ — l'identifiant du compte connecté n'est JAMAIS accepté du client :
 * il est systématiquement résolu depuis `userId` (issu du JWT). Un
 * `payoutMethodId` d'un autre investisseur remonte donc `NO_PAYOUT_METHOD`.
 *
 * DIP : dépend de trois ports (statut Connect, lecture, écriture) — aucun import
 * du SDK Stripe, testable sans réseau.
 */
@Injectable()
export class ManagePayoutMethodsUseCase {
  private readonly logger = new Logger(ManagePayoutMethodsUseCase.name);

  constructor(
    private readonly connectAccounts: ConnectAccountReader,
    private readonly reader: PayoutMethodsReader,
    private readonly writer: PayoutMethodsWriter,
    private readonly metrics: MetricsPort,
  ) {}

  /**
   * Destinations enregistrées + statut du compte connecté. Un investisseur sans
   * compte connecté reçoit une liste vide (pas une erreur) : le front affiche
   * alors l'invitation à faire l'onboarding.
   */
  async list(userId: number): Promise<{
    methods: PayoutMethodView[];
    connectStatus: ConnectAccountStatus;
  }> {
    const connectStatus = await this.connectAccounts.getAccountStatus(userId);
    if (!connectStatus.accountId) return { methods: [], connectStatus };
    return {
      methods: await this.reader.list(connectStatus.accountId),
      connectStatus,
    };
  }

  async attachCard(userId: number, token: string): Promise<PayoutMethodView> {
    const accountId = await this.requireConnectedAccount(userId);
    const method = await this.writer.attachCard(accountId, token);
    this.metrics.incrementCounter(METRIC.CONNECT_ONBOARDING_TOTAL, {
      event: 'payout_method_added',
    });
    this.logger.log(
      `Destination de retrait ajoutée: userId=${userId} method=${method.id} type=${method.type}`,
    );
    return method;
  }

  async detach(userId: number, payoutMethodId: string): Promise<void> {
    const accountId = await this.requireConnectedAccount(userId);
    await this.writer.detach(accountId, payoutMethodId);
    this.metrics.incrementCounter(METRIC.CONNECT_ONBOARDING_TOTAL, {
      event: 'payout_method_removed',
    });
    this.logger.log(
      `Destination de retrait supprimée: userId=${userId} method=${payoutMethodId}`,
    );
  }

  async setDefault(
    userId: number,
    payoutMethodId: string,
  ): Promise<PayoutMethodView> {
    const accountId = await this.requireConnectedAccount(userId);
    const method = await this.writer.setDefault(accountId, payoutMethodId);
    this.metrics.incrementCounter(METRIC.CONNECT_ONBOARDING_TOTAL, {
      event: 'payout_method_default',
    });
    return method;
  }

  async getInstantBalance(userId: number): Promise<InstantBalanceView> {
    const accountId = await this.requireConnectedAccount(userId);
    return this.reader.getInstantBalance(accountId);
  }

  /**
   * Compte connecté de l'investisseur ; refus explicite et typé si l'onboarding
   * Stripe n'a pas encore été fait.
   */
  private async requireConnectedAccount(userId: number): Promise<string> {
    const status = await this.connectAccounts.getAccountStatus(userId);
    if (!status.accountId) {
      throw new PayoutMethodError(
        'CONNECT_NOT_READY',
        'Connectez votre compte de retrait Stripe avant de gérer vos cartes.',
      );
    }
    return status.accountId;
  }
}

import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

/**
 * `ThrottlerGuard` étendu pour émettre `beown_throttle_blocked_total` à
 * chaque blocage effectif (M-5 : les paliers vivent dans Redis, partagés par
 * tous les réplicas — voir `RedisThrottlerStorage`).
 *
 * `handleRequest` (et non `throwThrottlingException`) est le point
 * d'interception choisi : c'est le seul endroit qui connaît encore le nom du
 * palier (`throttler.name` = short/medium/auth) — `throwThrottlingException`
 * ne reçoit qu'un `key` déjà haché (SHA-256), impossible à redécoder.
 *
 * ⚠ Zéro changement de comportement du blocage lui-même (délégué à
 * `super.handleRequest`) : uniquement un `try/catch` d'observation autour.
 */
@Injectable()
export class MetricsThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly metrics: MetricsPort,
  ) {
    super(options, storageService, reflector);
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (err) {
      if (err instanceof ThrottlerException) {
        this.metrics.incrementCounter(METRIC.THROTTLE_BLOCKED_TOTAL, {
          throttler: requestProps.throttler.name ?? 'default',
        });
      }
      throw err;
    }
  }
}

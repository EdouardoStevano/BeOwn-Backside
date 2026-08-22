import { EcheanceStatus } from '../enums/echeance.enum';
import { ServicingError, ServicingErrorKind } from './servicing.error';

// ── L'échéancier ────────────────────────────────────────────────────────────

/** L'échéance visée n'existe pas. */
export class EcheanceIntrouvableError extends ServicingError {
  readonly kind = ServicingErrorKind.NOT_FOUND;

  constructor(echeanceId?: string) {
    super('Échéance introuvable', {
      code: 'ECHEANCE_NOT_FOUND',
      details: echeanceId !== undefined ? { echeanceId } : undefined,
    });
  }
}

/** Une échéance déjà payée, annulée ou en perte définitive ne se règle pas. */
export class EcheanceNonPayableError extends ServicingError {
  readonly kind = ServicingErrorKind.CONFLICT;

  constructor(statut: EcheanceStatus) {
    super(`Échéance au statut "${statut}" non payable`, {
      code: 'ECHEANCE_NOT_PAYABLE',
      details: { statut },
    });
  }
}

/**
 * Un run concurrent (ou un retry du CRON) a déjà réglé cette échéance : le
 * claim conditionnel n'a affecté aucune ligne, aucun double-crédit n'a eu lieu.
 */
export class EcheanceDejaPayeeError extends ServicingError {
  readonly kind = ServicingErrorKind.CONFLICT;

  constructor() {
    super('Échéance déjà payée ou non payable', {
      code: 'ECHEANCE_ALREADY_PAID',
    });
  }
}

/**
 * Une durée ou un montant impossible ne peut provenir que d'une donnée
 * corrompue ou d'un défaut de programmation — jamais d'une entrée utilisateur.
 */
export class EchelonnementImpossibleError extends ServicingError {
  readonly kind = ServicingErrorKind.UNEXPECTED;

  constructor(raison: string, details?: Record<string, unknown>) {
    super(`Échéancier impossible à générer : ${raison}.`, { details });
  }
}

// ── Le règlement ────────────────────────────────────────────────────────────

/**
 * Le coupon ne peut pas être versé : l'investisseur n'a pas de wallet.
 *
 * Jumelle de l'erreur du même nom côté `subscription` — chaque contexte nomme
 * dans sa propre langue le fait qu'il ne trouve pas où créditer, plutôt que de
 * partager une classe d'erreur à travers une frontière (§3).
 */
export class WalletInvestisseurIntrouvableError extends ServicingError {
  readonly kind = ServicingErrorKind.NOT_FOUND;

  constructor() {
    super('Wallet investisseur introuvable', {
      code: 'WALLET_NOT_FOUND',
    });
  }
}

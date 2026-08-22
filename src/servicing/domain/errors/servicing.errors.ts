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
 * On ne vérifie qu'une échéance encore `A_VENIR`. Vérifier, c'est autoriser le
 * CRON à régler sans nouvelle intervention humaine : le geste n'a de sens que
 * sur une échéance qui n'a pas déjà été engagée.
 */
export class EcheanceNonVerifiableError extends ServicingError {
  readonly kind = ServicingErrorKind.CONFLICT;

  constructor(statut: EcheanceStatus) {
    super(
      `Échéance au statut "${statut}" : seule une échéance à venir se vérifie.`,
      {
        code: 'ECHEANCE_NOT_VERIFIABLE',
        details: { statut },
      },
    );
  }
}

/** On n'annule que la vérification d'une échéance encore en attente de paiement. */
export class VerificationNonAnnulableError extends ServicingError {
  readonly kind = ServicingErrorKind.CONFLICT;

  constructor(statut: EcheanceStatus) {
    super(
      `Échéance au statut "${statut}" : sa vérification ne peut plus être annulée.`,
      { code: 'VERIFICATION_NOT_CANCELLABLE', details: { statut } },
    );
  }
}

/** Une échéance réglée ne se corrige plus : sa trace fiscale est arrêtée. */
export class EcheanceRegleeNonModifiableError extends ServicingError {
  readonly kind = ServicingErrorKind.CONFLICT;

  constructor() {
    super('Une échéance payée ne peut plus être modifiée.', {
      code: 'ECHEANCE_ALREADY_PAID',
    });
  }
}

/** Ni ne s'efface. */
export class EcheanceRegleeNonSupprimableError extends ServicingError {
  readonly kind = ServicingErrorKind.CONFLICT;

  constructor() {
    super('Une échéance payée ne peut pas être supprimée.', {
      code: 'ECHEANCE_ALREADY_PAID',
    });
  }
}

/**
 * On ne retire un numéro de l'échéancier d'un projet que si aucune de ses
 * échéances n'a bougé : une seule vérifiée ou payée, et la renumérotation des
 * suivantes décalerait un calendrier déjà engagé.
 */
export class NumeroDEcheanceNonSupprimableError extends ServicingError {
  readonly kind = ServicingErrorKind.CONFLICT;

  constructor() {
    super(
      "Impossible de supprimer ce numéro : au moins une échéance n'est plus A_VENIR.",
      { code: 'ECHEANCE_NUMERO_NOT_DELETABLE' },
    );
  }
}

/** Le projet visé n'a aucun investissement, donc aucun échéancier. */
export class AucunInvestissementSurLeProjetError extends ServicingError {
  readonly kind = ServicingErrorKind.NOT_FOUND;

  constructor(projetId?: string) {
    super('Aucun investissement sur ce projet', {
      code: 'NO_INVESTMENT_ON_PROJECT',
      details: projetId !== undefined ? { projetId } : undefined,
    });
  }
}

/** Aucune échéance ne porte ce numéro sur ce projet. */
export class NumeroDEcheanceIntrouvableError extends ServicingError {
  readonly kind = ServicingErrorKind.NOT_FOUND;

  constructor(numero: number) {
    super(`Aucune échéance #${numero} sur ce projet`, {
      code: 'ECHEANCE_NUMERO_NOT_FOUND',
      details: { numero },
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

/**
 * L'investissement dont on demande l'échéancier n'existe pas.
 *
 * Homonyme de l'erreur de `subscription`, et c'est voulu : chaque contexte
 * nomme dans sa propre langue ce qu'il ne trouve pas, plutôt que de partager
 * une classe d'erreur à travers une frontière (§3). Le contrat rendu au front
 * — statut et code — est le même des deux côtés.
 */
export class InvestissementIntrouvableError extends ServicingError {
  readonly kind = ServicingErrorKind.NOT_FOUND;

  constructor(investissementId?: string) {
    super('Investissement introuvable', {
      code: 'INVESTMENT_NOT_FOUND',
      details:
        investissementId !== undefined ? { investissementId } : undefined,
    });
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

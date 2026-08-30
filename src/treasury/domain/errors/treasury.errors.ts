import { formatEur } from 'src/shared/money/format-eur';
import { TreasuryError, TreasuryErrorKind } from './treasury.error';
import type { WalletStatut } from '../enums/wallet.enum';

/*
 * Les messages reprennent ceux que les `BadRequestException`,
 * `ForbiddenException` et `NotFoundException` remplacées portaient : les
 * réponses HTTP ne changent pas. Les `code` sont un ajout — les codes stables
 * de l'Annexe B du cahier des charges (§21), que le front peut consommer sans
 * parser le texte.
 */

/** Le portefeuille visé n'existe pas. */
export class WalletIntrouvableError extends TreasuryError {
  readonly kind = TreasuryErrorKind.NOT_FOUND;

  constructor(walletId?: string) {
    super('Wallet introuvable.', {
      code: 'WALLET_NOT_FOUND',
      details: walletId !== undefined ? { walletId } : undefined,
    });
  }
}

/** Un portefeuille ne se consulte que par son titulaire ou par le back-office. */
export class AccesWalletRefuseError extends TreasuryError {
  readonly kind = TreasuryErrorKind.FORBIDDEN;

  constructor() {
    super('Acces refuse.', { code: 'NOT_WALLET_OWNER' });
  }
}

/**
 * Le solde ne couvre pas le mouvement demandé — l'invariant central de
 * l'agrégat : un portefeuille ne passe jamais sous zéro.
 *
 * §21 la désigne sous le nom `InsufficientWalletBalanceError` ; le code suit
 * la convention francophone des autres contextes, le `code` d'Annexe B est
 * celui du tableau.
 */
export class SoldeInsuffisantError extends TreasuryError {
  readonly kind = TreasuryErrorKind.INVALID_INPUT;

  constructor(disponible: number, demande: number) {
    super(
      `Solde insuffisant. Disponible : ${formatEur(disponible)} — Requis : ${formatEur(demande)}`,
      { code: 'WALLET_INSUFFICIENT', details: { disponible, demande } },
    );
  }
}

/**
 * Le portefeuille est gelé : aucun mouvement ne l'entame ni ne l'alimente.
 *
 * §21 la désigne sous le nom `WalletFrozenError`.
 */
export class WalletGeleError extends TreasuryError {
  readonly kind = TreasuryErrorKind.CONFLICT;

  constructor(statut: WalletStatut) {
    super('Ce wallet est gelé : aucun mouvement n’est possible.', {
      code: 'WALLET_FROZEN',
      details: { statut },
    });
  }
}

/** Créditer ou débiter zéro n'est pas un mouvement. */
export class MontantDeMouvementInvalideError extends TreasuryError {
  readonly kind = TreasuryErrorKind.INVALID_INPUT;

  constructor(montant: number) {
    super('Le montant d’un mouvement doit être strictement positif.', {
      code: 'INVALID_AMOUNT',
      details: { montant },
    });
  }
}

/**
 * Un taux qui n'en est pas un : un `NaN`, un infini, ou un taux négatif.
 *
 * Distincte des erreurs de montant : un pourcentage n'est pas une somme, et
 * confondre les deux — ce que faisait le `number` nu qu'il remplace — est
 * précisément l'erreur d'ordre de grandeur qu'on cherche à rendre impossible.
 */
export class PourcentageInvalideError extends TreasuryError {
  readonly kind = TreasuryErrorKind.INVALID_INPUT;

  constructor(valeur: number) {
    super('Un taux doit être un nombre fini et positif.', {
      code: 'INVALID_RATE',
      details: { valeur },
    });
  }
}

/**
 * Une somme qui n'en est pas une : un `NaN`, un infini, ou un nombre négatif.
 *
 * Distincte de {@link MontantDeMouvementInvalideError}, qui refuse le **zéro**
 * parce qu'un mouvement nul n'est pas un mouvement. Ici c'est la somme
 * elle-même qui est inexprimable, et zéro l'est parfaitement — c'est le solde
 * d'un portefeuille qui vient d'être ouvert.
 */
export class MontantInvalideError extends TreasuryError {
  readonly kind = TreasuryErrorKind.INVALID_INPUT;

  constructor(montant: number) {
    super(
      'Un montant doit être un nombre fini et positif : ce contexte ne connaît pas de solde débiteur.',
      { code: 'INVALID_AMOUNT', details: { montant } },
    );
  }
}

/**
 * Un mouvement dans une devise étrangère au portefeuille — la conversion n'est
 * pas du ressort de ce contexte, et mélanger deux devises sur un même solde le
 * rendrait faux.
 */
export class DeviseIncoherenteError extends TreasuryError {
  readonly kind = TreasuryErrorKind.INVALID_INPUT;

  constructor(deviseWallet: string, deviseMouvement: string) {
    super(
      `Ce wallet est en ${deviseWallet} : un mouvement en ${deviseMouvement} ne peut pas y être imputé.`,
      {
        code: 'WALLET_CURRENCY_MISMATCH',
        details: { deviseWallet, deviseMouvement },
      },
    );
  }
}

/**
 * Le paiement qu'on demande à créditer appartient à quelqu'un d'autre.
 *
 * L'invariant est celui de l'audit H-1 : le `PaymentIntent` porte le compte
 * qui l'a ouvert, et lui seul peut en récolter le crédit. Sans cette règle,
 * connaître un identifiant `pi_xxx` — qui transite par le navigateur du
 * payeur — suffirait à s'en attribuer le montant.
 *
 * Elle vivait dans le contrôleur, en `ForbiddenException` levée à la main
 * (§14, §21). Le statut HTTP rendu est le même : `TreasuryErrorFilter` traduit
 * `FORBIDDEN` en 403, avec en plus le `code` que le front peut lire.
 */
export class PaiementEtrangerAuCompteError extends TreasuryError {
  readonly kind = TreasuryErrorKind.FORBIDDEN;

  constructor(details?: Record<string, unknown>) {
    super("Ce paiement n'appartient pas à votre compte.", {
      code: 'PAYMENT_NOT_OWNED',
      details,
    });
  }
}

/** Le mouvement de retrait visé n'existe pas, ou n'est pas un retrait. */
export class RetraitIntrouvableError extends TreasuryError {
  readonly kind = TreasuryErrorKind.NOT_FOUND;

  constructor(transactionId?: string) {
    super('Retrait introuvable.', {
      code: 'WITHDRAWAL_NOT_FOUND',
      details: transactionId !== undefined ? { transactionId } : undefined,
    });
  }
}

/**
 * Retirer suppose un compte de retrait en état de recevoir les fonds.
 *
 * Ce n'est pas un échec technique : tant que l'investisseur n'a pas terminé
 * l'onboarding de son compte connecté — ou fourni un IBAN pour le parcours
 * manuel de secours — il n'y a nulle part où verser. Le message dit le geste
 * qui débloque, plutôt que de constater l'impossibilité.
 */
export class CompteDeRetraitNonPretError extends TreasuryError {
  readonly kind = TreasuryErrorKind.CONFLICT;

  constructor() {
    super(
      'Connectez votre compte de retrait Stripe pour effectuer un retrait.',
      { code: 'CONNECT_NOT_READY' },
    );
  }
}

/**
 * L'événement reçu ne porte pas la signature attendue.
 *
 * Le seul cas où ce contexte refuse quelque chose au **transport** plutôt qu'à
 * un titulaire : l'endpoint webhook est public, et sa signature HMAC est la
 * seule preuve que l'événement vient bien de Stripe. Elle est éprouvée avant
 * toute lecture du corps — un événement non signé ne doit atteindre ni la
 * trésorerie ni le contexte de conformité, avec qui l'endpoint est partagé.
 */
export class SignatureWebhookInvalideError extends TreasuryError {
  readonly kind = TreasuryErrorKind.INVALID_INPUT;

  constructor(raison: string, cause?: unknown) {
    super(`Webhook signature invalide: ${raison}`, {
      code: 'INVALID_WEBHOOK_SIGNATURE',
      cause,
    });
  }
}

/**
 * Un portefeuille d'investisseur appartient à un utilisateur ; un portefeuille
 * de plateforme n'en a pas. Ouvrir l'un avec l'état de l'autre produirait un
 * solde que personne ne peut réclamer.
 */
export class TitulariteWalletIncoherenteError extends TreasuryError {
  readonly kind = TreasuryErrorKind.INVALID_INPUT;

  constructor(raison: string, details?: Record<string, unknown>) {
    super(`Ouverture de wallet impossible : ${raison}.`, {
      code: 'WALLET_OWNERSHIP_MISMATCH',
      details,
    });
  }
}

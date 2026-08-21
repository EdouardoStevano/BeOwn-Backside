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

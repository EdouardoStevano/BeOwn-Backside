/**
 * Grand livre du jeu de données seedé — module PUR.
 *
 * Aucun import TypeORM, NestJS ou réseau : uniquement le domaine
 * `wallets/domains/grand-livre` et le vocabulaire des statuts. C'est ce qui
 * permet de vérifier l'invariant comptable du seed PAR CONSTRUCTION et de le
 * tester en jest sans base de données (`seed-ledger.spec.ts`).
 *
 * PRINCIPE — le SeedService ne pose JAMAIS un solde à la main : chaque
 * écriture insérée en base passe d'abord par `enregistrer()`, qui applique le
 * mouvement aux positions en mémoire selon les MÊMES règles que la
 * réconciliation nocturne (`ReconciliationService`) :
 *
 *  - seules les écritures dont le statut appartient à
 *    `STATUTS_MOUVEMENT_APPLIQUE` (REUSSI, EN_COURS, EN_ATTENTE_PAIEMENT)
 *    déplacent un solde ET comptent au registre — un dépôt ECHOUE n'existe
 *    que comme ligne d'historique ;
 *  - un blocage d'escrow (délai de réflexion) est un mouvement INTRA-wallet :
 *    disponible → bloqué, fonds détenus constants ;
 *  - une libération d'escrow dénoue la poche bloquée du souscripteur vers le
 *    solde du wallet destinataire (le projet), fonds détenus conservés
 *    globalement.
 *
 * À la fin du seed, les soldes réels des wallets sont POSÉS depuis
 * `solde()`/`soldeBloque()` et `ecarts()` doit rendre un tableau vide :
 * c'est exactement le contrôle `rapprocherGrandLivre` que le job de
 * réconciliation rejouera chaque nuit sur ce jeu de données.
 */
import {
  EcartRapprochement,
  EcritureGrandLivre,
  PositionWallet,
  rapprocherGrandLivre,
} from 'src/wallets/domains/grand-livre';
import {
  STATUTS_MOUVEMENT_APPLIQUE,
  TransactionStatus,
} from 'src/wallets/domains/enums/wallet.enum';

/**
 * Effet d'un mouvement sur les poches des wallets :
 *  - `transfert`  : débit du solde disponible de la source, crédit de celui de
 *                   la destination (un côté null = contrepartie externe) ;
 *  - `blocage`    : disponible → bloqué sur le MÊME wallet (souscription d'un
 *                   non averti pendant le délai de réflexion, ESCROW_LOCK) ;
 *  - `liberation` : bloqué de la source → disponible de la destination
 *                   (expiration du délai : ESCROW_RELEASE vers le projet ;
 *                   rétractation : source = destination).
 */
export type EffetMouvement = 'transfert' | 'blocage' | 'liberation';

export interface MouvementSeed {
  /** Wallet débité — null pour une contrepartie externe (dépôt par carte). */
  source: string | null;
  /** Wallet crédité — null pour une contrepartie externe (retrait bancaire). */
  destination: string | null;
  montant: number;
  statut: TransactionStatus;
  /** Défaut : `transfert`. */
  effet?: EffetMouvement;
}

interface PositionMutable {
  solde: number;
  soldeBloque: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export class LivreSeed {
  private readonly positions = new Map<string, PositionMutable>();
  private readonly ecritures: EcritureGrandLivre[] = [];

  private position(walletId: string): PositionMutable {
    let p = this.positions.get(walletId);
    if (!p) {
      p = { solde: 0, soldeBloque: 0 };
      this.positions.set(walletId, p);
    }
    return p;
  }

  /**
   * Applique un mouvement aux positions ET l'inscrit au registre — uniquement
   * si son statut a réellement déplacé un solde (parité stricte avec la
   * sélection d'écritures de `ReconciliationService`).
   */
  enregistrer(m: MouvementSeed): void {
    if (!Number.isFinite(m.montant) || m.montant < 0) {
      throw new Error(`Montant invalide pour une écriture du seed : ${m.montant}`);
    }
    if (!STATUTS_MOUVEMENT_APPLIQUE.includes(m.statut)) {
      // Ligne d'historique pur (INITIE, ECHOUE…) : aucun solde touché, aucune
      // ligne au registre du rapprochement — comme en production.
      return;
    }

    const effet = m.effet ?? 'transfert';
    switch (effet) {
      case 'blocage': {
        if (!m.source || m.source !== m.destination) {
          throw new Error(
            'Un blocage d’escrow est un mouvement intra-wallet : source et destination doivent porter le même wallet.',
          );
        }
        const p = this.position(m.source);
        p.solde = round2(p.solde - m.montant);
        p.soldeBloque = round2(p.soldeBloque + m.montant);
        break;
      }
      case 'liberation': {
        if (!m.source || !m.destination) {
          throw new Error(
            'Une libération d’escrow relie deux wallets : source (poche bloquée) et destination (solde).',
          );
        }
        const src = this.position(m.source);
        src.soldeBloque = round2(src.soldeBloque - m.montant);
        const dst = this.position(m.destination);
        dst.solde = round2(dst.solde + m.montant);
        break;
      }
      case 'transfert': {
        if (!m.source && !m.destination) {
          throw new Error('Une écriture sans aucun wallet ne déplace rien.');
        }
        if (m.source) {
          const src = this.position(m.source);
          src.solde = round2(src.solde - m.montant);
        }
        if (m.destination) {
          const dst = this.position(m.destination);
          dst.solde = round2(dst.solde + m.montant);
        }
        break;
      }
    }

    this.ecritures.push({
      walletSource: m.source,
      walletDestination: m.destination,
      montant: m.montant,
    });
  }

  /** Solde disponible attendu du wallet, dérivé des seules écritures. */
  solde(walletId: string): number {
    return this.positions.get(walletId)?.solde ?? 0;
  }

  /** Poche bloquée attendue du wallet (délai de réflexion en cours). */
  soldeBloque(walletId: string): number {
    return this.positions.get(walletId)?.soldeBloque ?? 0;
  }

  /** Positions attendues de tous les wallets touchés par le seed. */
  soldes(): ReadonlyMap<string, PositionWallet> {
    const copie = new Map<string, PositionWallet>();
    for (const [walletId, p] of this.positions) {
      copie.set(walletId, { solde: p.solde, soldeBloque: p.soldeBloque });
    }
    return copie;
  }

  /** Nombre d'écritures inscrites au registre (mouvement appliqué). */
  get nbEcritures(): number {
    return this.ecritures.length;
  }

  /** Nombre de wallets touchés par au moins un mouvement. */
  get nbWallets(): number {
    return this.positions.size;
  }

  /**
   * Rapprochement du registre construit contre les positions qu'il induit —
   * le MÊME contrôle que la réconciliation nocturne. Tableau vide = le jeu de
   * données seedé sortira à 0 écart de `rapprocherGrandLivre`.
   */
  ecarts(): EcartRapprochement[] {
    return rapprocherGrandLivre(this.soldes(), this.ecritures);
  }

  /**
   * Rapprochement contre des positions FOURNIES (par exemple relues en base
   * après insertion) : détecte un solde posé à la main qui divergerait du
   * registre.
   */
  ecartsContre(
    positionsReelles: ReadonlyMap<string, PositionWallet>,
  ): EcartRapprochement[] {
    return rapprocherGrandLivre(positionsReelles, this.ecritures);
  }
}

import type { Wallet } from '../aggregates/wallet';
import { AccesWalletRefuseError } from '../errors/treasury.errors';

/**
 * Qui demande, et à quel titre.
 *
 * `peutGererLesPortefeuilles` est la **conclusion** du contrôle de permission,
 * pas la permission elle-même : la présentation traduit `platform:wallet` en
 * booléen, et le domaine n'a pas à connaître le nom d'une permission ni la
 * table des rôles (§3.3). Ce qui reste ici est ce qui parle de portefeuilles —
 * un solde se consulte par son titulaire.
 */
export interface DemandeurDePortefeuille {
  utilisateurId: number;
  peutGererLesPortefeuilles: boolean;
}

/**
 * **Un solde se consulte par son titulaire, ou par qui gère la trésorerie.**
 *
 * Une Specification au sens du §22 : un critère métier réutilisable, énoncé une
 * fois. Elle est ici parce que trois lectures l'appliquent — le portefeuille
 * par son identité, celui d'un titulaire, et le relevé de ses mouvements — et
 * que la recopier trois fois, c'est se donner trois occasions de la relâcher.
 *
 * Elle a d'abord vécu dans `WalletController`, puis dans un use case qui
 * réunissait les trois lectures pour ne pas la dupliquer. C'était traiter le
 * symptôme : ce qui liait ces lectures n'était pas leur intention — elles en
 * ont trois différentes — mais **cette règle**. Une fois la règle nommée, les
 * lectures n'ont plus de raison de rester ensemble.
 *
 * Une Specification et non une Policy : le critère est stable. §22 réserve le
 * nom de Policy aux règles volatiles ou configurables — le rang de réservation,
 * dont le cahier des charges se contredit encore. Ici, rien ne dit qu'on
 * ouvrira un jour la lecture d'un solde à quelqu'un d'autre.
 */
export class PortefeuilleLisibleSpecification {
  constructor(private readonly demandeur: DemandeurDePortefeuille) {}

  isSatisfiedBy(portefeuille: Wallet): boolean {
    if (portefeuille.appartientA(this.demandeur.utilisateurId)) return true;

    // Un portefeuille de plateforme n'appartient à personne : seule
    // l'habilitation l'ouvre, et c'est voulu.
    return this.demandeur.peutGererLesPortefeuilles;
  }

  /**
   * La même règle, sous la forme dont les appelants ont besoin.
   *
   * Elle évite trois `if (!spec.isSatisfiedBy(w)) throw …` identiques, sans
   * masquer quoi que ce soit : l'erreur levée est celle du domaine, et
   * `TreasuryErrorFilter` la traduit en 403 (§21).
   *
   * @throws AccesWalletRefuseError
   */
  eprouver(portefeuille: Wallet): void {
    if (!this.isSatisfiedBy(portefeuille)) throw new AccesWalletRefuseError();
  }
}

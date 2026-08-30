import type { BaremeDesFrais } from 'src/treasury/domain/value-objects/bareme-des-frais.vo';

export const BAREME_DES_FRAIS_QUERY = Symbol('BAREME_DES_FRAIS_QUERY');

/**
 * Où la plateforme lit ses taux de commission.
 *
 * **Ce port n'existait pas**, et son absence se voyait : `PlatformFeesService`
 * se faisait injecter `Repository<AdminSettingsEntity>` — TypeORM, et l'entité
 * ORM d'un **autre module** (`src/admin`) — dans la couche application. Deux
 * fois §27 dans une seule ligne de constructeur.
 *
 * Un port de lecture, pas un repository (§11) : le barème n'est pas un agrégat
 * qu'on modifie et réenregistre. Il est **écrit ailleurs** — l'écran de
 * paramétrage du super-administrateur — et lu ici. Ce contexte le consomme, il
 * n'en est pas propriétaire.
 */
export interface BaremeDesFraisQuery {
  /**
   * Le barème courant — **jamais `null`**. Aucun paramétrage enregistré n'est
   * pas une absence de barème mais le barème par défaut : la plateforme facture
   * dès le premier jour, avant que quiconque ait ouvert l'écran des
   * commissions.
   */
  lire(): Promise<BaremeDesFrais>;
}

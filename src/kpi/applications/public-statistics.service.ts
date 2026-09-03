import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface PublicStatistics {
  misAJourLe: string;
  projetsFinances: number;
  projetsEnCollecte: number;
  montantCollecteEur: number;
  loyersDistribuesEur: number;
  investisseursActifs: number;
  tauxOccupationMoyenPct: number | null;
}

/**
 * Agrégats d'activité publics, relus de la base et cachés 60 secondes.
 *
 * HONNÊTETÉ D'ABORD — chaque compteur a une définition traçable :
 *  - `projetsFinances`      : projets en statut finance/en_exploitation/cloture
 *    (la collecte a abouti, quel que soit le stade de vie ultérieur) ;
 *  - `projetsEnCollecte`    : statut en_collecte ;
 *  - `montantCollecteEur`   : Σ des investissements aux statuts qui engagent
 *    réellement des fonds (confirmé + délai de réflexion en cours) — les
 *    INITIE fantômes et les rétractés n'en font pas partie ;
 *  - `loyersDistribuesEur`  : Σ BRUTE des parts de distribution payées
 *    (net + IR + CSG = ce que les biens ont réellement produit) ;
 *  - `investisseursActifs`  : nombre DISTINCT de détenteurs d'au moins un
 *    investissement engagé ;
 *  - `tauxOccupationMoyenPct` : `null` tant que l'agrégat locatif n'est pas
 *    branché — un « non publié » assumé, JAMAIS un zéro qui se lirait comme
 *    « tout est vide » ni un chiffre inventé (le front affiche « — »).
 *
 * CACHE 60 s EN MÉMOIRE DE PROCESSUS — entorse assumée à la règle stateless,
 * documentée : la donnée est publique, idempotente, identique pour tous ; la
 * perdre (redémarrage) coûte UNE requête d'agrégats ; la divergence entre
 * réplicas est bornée à 60 s sur des compteurs qui bougent à l'heure. Un
 * cache Redis ajouterait un aller-réseau pour protéger… des lectures SQL
 * indexées. Si ces compteurs deviennent chauds, le déplacer dans le
 * CACHE_MANAGER existant est un changement local à ce fichier.
 */
@Injectable()
export class PublicStatisticsService {
  private static readonly TTL_MS = 60_000;
  private cache: { calculeA: number; valeur: PublicStatistics } | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async lire(): Promise<PublicStatistics> {
    const maintenant = Date.now();
    if (
      this.cache &&
      maintenant - this.cache.calculeA < PublicStatisticsService.TTL_MS
    ) {
      return this.cache.valeur;
    }

    const [projets, engagements, loyers] = await Promise.all([
      this.dataSource.query(
        `SELECT
           COUNT(*) FILTER (WHERE statut IN ('finance', 'en_exploitation', 'cloture')) AS finances,
           COUNT(*) FILTER (WHERE statut = 'en_collecte') AS en_collecte
         FROM projet`,
      ),
      this.dataSource.query(
        `SELECT
           COALESCE(SUM(montant), 0) AS collecte,
           COUNT(DISTINCT "utilisateurId") AS investisseurs
         FROM investissement
         WHERE statut IN ('confirme', 'en_delai_retractation')`,
      ),
      this.dataSource.query(
        `SELECT COALESCE(SUM("montantBrut"), 0) AS brut
         FROM distribution_part
         WHERE "payeLe" IS NOT NULL`,
      ),
    ]);

    const valeur: PublicStatistics = {
      misAJourLe: new Date().toISOString(),
      projetsFinances: Number(projets[0]?.finances ?? 0),
      projetsEnCollecte: Number(projets[0]?.en_collecte ?? 0),
      montantCollecteEur: Number(engagements[0]?.collecte ?? 0),
      loyersDistribuesEur: Number(loyers[0]?.brut ?? 0),
      investisseursActifs: Number(engagements[0]?.investisseurs ?? 0),
      tauxOccupationMoyenPct: null,
    };

    this.cache = { calculeA: maintenant, valeur };
    return valeur;
  }
}

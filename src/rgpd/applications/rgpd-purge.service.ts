import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  FinalitePurge,
  MAX_LOTS_PAR_RUN,
  TAILLE_LOT_PURGE,
  seuilPurge,
} from 'src/rgpd/domains/retention-policy';
import { AnonymizeAccountService } from 'src/rgpd/applications/anonymize-account.service';
import { StockageFichiersPort } from 'src/rgpd/applications/ports/stockage-fichiers.port';

export interface CompteurFinalite {
  finalite: FinalitePurge;
  /** Lignes (ou comptes) effectivement traitées pendant ce run. */
  traites: number;
  /**
   * Comptes ÉLIGIBLES mais exclus du run parce qu'une réclamation est ouverte
   * (règle transverse n° 3 du barème : suspension de la purge en cas de
   * litige — journalisée, art. 5.2 RGPD).
   */
  suspendusLitige: number;
  /**
   * Comptes ÉLIGIBLES mais exclus du run parce que leurs avoirs sont gelés
   * (même règle transverse n° 3 : une mesure de gel suspend la purge jusqu'à
   * levée — un compte gelé ne doit être ni supprimé ni anonymisé tant que la
   * mesure court). Journalisé, art. 5.2 RGPD.
   */
  suspendusGel: number;
}

export interface RapportPurgeRgpd {
  executeLe: string;
  compteurs: CompteurFinalite[];
  totalTraites: number;
}

/** Statuts d'une réclamation encore ouverte (litige → purge suspendue). */
const RECLAMATION_OUVERTE = `('recue','accuse_reception','en_instruction')`;

/**
 * Nombre de lignes affectées par un DELETE/UPDATE émis via `dataSource.query`.
 * Le driver PostgreSQL de TypeORM renvoie `[rows, rowCount]` pour les
 * requêtes DML (et non le tableau de lignes d'un SELECT) : compter `.length`
 * sur ce retour vaudrait toujours 2 — piège vérifié sur base dev.
 */
function lignesAffectees(resultat: unknown): number {
  if (
    Array.isArray(resultat) &&
    resultat.length === 2 &&
    Array.isArray(resultat[0]) &&
    typeof resultat[1] === 'number'
  ) {
    return resultat[1];
  }
  return 0;
}

/** Rôles plateforme purgeables — jamais un compte back-office. */
const ROLES_PLATEFORME = `('investisseur','porteur','cgp')`;

/**
 * Clause de suspension sur gel des avoirs (mission 4 du lot) : un compte gelé
 * est exclu de toute purge/anonymisation le concernant jusqu'à levée de la
 * mesure — ses données doivent rester intactes et exploitables.
 */
const CLAUSE_AVOIRS_NON_GELES = `u."avoirsGelesLe" IS NULL`;

/**
 * Purge RGPD par finalité — exécution du barème de conservation
 * (`src/rgpd/domains/retention-policy.ts`, transcription du document de
 * conformité). Appelée par le cron quotidien ET par
 * `POST /admin/rgpd/purge/run` : le même code sert les deux chemins.
 *
 * Garanties d'exécution :
 * - IDEMPOTENTE : chaque finalité sélectionne uniquement ce qui reste à
 *   traiter — un second run immédiat traite 0 ligne. Sûre en mono-réplica
 *   (H2 du plan de lot) ; le verrou multi-réplicas est la réserve du lot 3.
 * - LOTS BORNÉS : aucun DELETE/UPDATE sans LIMIT (`TAILLE_LOT_PURGE`),
 *   plafond `MAX_LOTS_PAR_RUN` par finalité et par run — le stock résiduel
 *   attend le run suivant.
 * - SUSPENSION SUR LITIGE : un compte avec réclamation ouverte est exclu de
 *   toute purge le concernant, et compté dans `suspendusLitige` (accountability).
 * - SUSPENSION SUR GEL DES AVOIRS : un compte gelé (`users.avoirsGelesLe`
 *   non nul — mission 4 du lot) est exclu de toute purge le concernant et
 *   compté dans `suspendusGel`, jusqu'à levée de la mesure.
 * - JOURNALISATION par finalité (art. 5.2 RGPD) : volumes en logs structurés.
 *
 * SQL brut assumé : les critères (NOT EXISTS multiples, LIMIT sur DELETE via
 * sous-requête, RETURNING pour compter) s'expriment mal via les repositories ;
 * les seuils temporels viennent TOUS du domaine (`seuilPurge`), jamais d'un
 * intervalle écrit en dur ici.
 */
@Injectable()
export class RgpdPurgeService {
  private readonly logger = new Logger(RgpdPurgeService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly anonymizeAccount: AnonymizeAccountService,
    private readonly stockage: StockageFichiersPort,
  ) {}

  async purger(maintenant: Date = new Date()): Promise<RapportPurgeRgpd> {
    const compteurs: CompteurFinalite[] = [
      await this.purgerComptesSupprimesNonAnonymises(),
      await this.purgerComptesJamaisActives(maintenant),
      await this.purgerProspectsInactifs(maintenant),
      await this.purgerKycEchusPostCloture(maintenant),
      await this.purgerNotifications(maintenant),
      await this.purgerJournauxAudit(maintenant),
      // Lot 4 — trois passes sur `demande_acces_porteur`, dans cet ordre :
      // le texte libre part à 2 ans, la ligne de décision à 5 ans, la demande
      // jamais instruite à 12 mois.
      await this.purgerTexteLibreDemandesPorteur(maintenant),
      await this.purgerDecisionsDemandesPorteur(maintenant),
      await this.purgerDemandesPorteurCaduques(maintenant),
    ];

    const totalTraites = compteurs.reduce((s, c) => s + c.traites, 0);
    const rapport: RapportPurgeRgpd = {
      executeLe: maintenant.toISOString(),
      compteurs,
      totalTraites,
    };

    for (const c of compteurs) {
      this.logger.log(
        `Purge RGPD — ${c.finalite} : ${c.traites} traitée(s)` +
          (c.suspendusLitige > 0
            ? `, ${c.suspendusLitige} suspendue(s) pour litige`
            : '') +
          (c.suspendusGel > 0
            ? `, ${c.suspendusGel} suspendue(s) pour gel des avoirs`
            : ''),
      );
    }
    // Ligne de synthèse machine-lisible (accountability art. 5.2 RGPD).
    this.logger.log(`Purge RGPD — rapport : ${JSON.stringify(rapport)}`);
    return rapport;
  }

  // ── Filet : comptes SUPPRIME jamais anonymisés ────────────────────────────

  private async purgerComptesSupprimesNonAnonymises(): Promise<CompteurFinalite> {
    const eligiblesSql = `
      FROM users u
      WHERE u.status = 'supprime' AND u."anonymiseLe" IS NULL`;
    const suspendusLitige = await this.compterSuspendusLitige(eligiblesSql);
    const suspendusGel = await this.compterSuspendusGel(eligiblesSql);

    const traites = await this.parLots(async (limit) => {
      const rows: Array<{ userId: number }> = await this.dataSource.query(
        `SELECT u."userId" ${eligiblesSql}
           AND NOT ${this.existeReclamationOuverte('u')}
           AND ${CLAUSE_AVOIRS_NON_GELES}
         ORDER BY u."userId" LIMIT $1`,
        [limit],
      );
      for (const { userId } of rows) {
        await this.anonymizeAccount.anonymiser(userId);
      }
      return rows.length;
    });

    return {
      finalite: FinalitePurge.COMPTE_SUPPRIME_A_ANONYMISER,
      traites,
      suspendusLitige,
      suspendusGel,
    };
  }

  // ── Ligne 1 : comptes jamais activés (30 jours) ───────────────────────────

  private async purgerComptesJamaisActives(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(FinalitePurge.COMPTE_JAMAIS_ACTIVE, maintenant);
    // Gardes « aucune donnée liée » : un compte CREE ne devrait rien porter ;
    // si quelque chose existe malgré tout, il est laissé de côté (et sera
    // rattrapé par une autre finalité le cas échéant) — on ne purge jamais
    // dans le doute.
    const eligiblesSql = `
      FROM users u
      WHERE u.status = 'cree'
        AND u.role IN ${ROLES_PLATEFORME}
        AND u."createdAt" < $1
        AND NOT EXISTS (SELECT 1 FROM kyc k WHERE k."utilisateurId" = u."userId")
        AND NOT EXISTS (SELECT 1 FROM wallet w WHERE w."proprietaireUserId" = u."userId")
        AND NOT EXISTS (SELECT 1 FROM investissement i WHERE i."utilisateurId" = u."userId")
        AND NOT EXISTS (SELECT 1 FROM document d WHERE d."userId" = u."userId")`;
    const suspendusLitige = await this.compterSuspendusLitige(eligiblesSql, [
      seuil,
    ]);
    const suspendusGel = await this.compterSuspendusGel(eligiblesSql, [seuil]);

    const traites = await this.parLots((limit) =>
      this.supprimerComptes(
        `SELECT u."userId" ${eligiblesSql}
           AND NOT ${this.existeReclamationOuverte('u')}
           AND ${CLAUSE_AVOIRS_NON_GELES}
         ORDER BY u."userId" LIMIT $2`,
        [seuil, limit],
      ),
    );

    return {
      finalite: FinalitePurge.COMPTE_JAMAIS_ACTIVE,
      traites,
      suspendusLitige,
      suspendusGel,
    };
  }

  // ── Ligne 2 : prospects inactifs (3 ans après le dernier contact) ─────────

  private async purgerProspectsInactifs(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(FinalitePurge.PROSPECT_INACTIF, maintenant);
    // « Purge si aucune donnée liée » (barème ligne 2) : les gardes NOT EXISTS
    // garantissent qu'il n'y a rien d'autre à anonymiser — la ligne peut donc
    // être supprimée. Un prospect portant la moindre donnée liée n'est pas un
    // prospect au sens de cette finalité : il est ignoré.
    const eligiblesSql = `
      FROM users u
      WHERE u.status IN ('email_verifie','actif')
        AND u.role IN ${ROLES_PLATEFORME}
        AND COALESCE(u."lastLoginAt", u."createdAt") < $1
        AND NOT EXISTS (SELECT 1 FROM kyc k WHERE k."utilisateurId" = u."userId")
        AND NOT EXISTS (SELECT 1 FROM wallet w WHERE w."proprietaireUserId" = u."userId")
        AND NOT EXISTS (SELECT 1 FROM investissement i WHERE i."utilisateurId" = u."userId")
        AND NOT EXISTS (SELECT 1 FROM document d WHERE d."userId" = u."userId")
        AND NOT EXISTS (SELECT 1 FROM ordre_marche o
                        WHERE o."vendeurId" = u."userId" OR o."acheteurId" = u."userId")`;
    const suspendusLitige = await this.compterSuspendusLitige(eligiblesSql, [
      seuil,
    ]);
    const suspendusGel = await this.compterSuspendusGel(eligiblesSql, [seuil]);

    const traites = await this.parLots((limit) =>
      this.supprimerComptes(
        `SELECT u."userId" ${eligiblesSql}
           AND NOT ${this.existeReclamationOuverte('u')}
           AND ${CLAUSE_AVOIRS_NON_GELES}
         ORDER BY u."userId" LIMIT $2`,
        [seuil, limit],
      ),
    );

    return {
      finalite: FinalitePurge.PROSPECT_INACTIF,
      traites,
      suspendusLitige,
      suspendusGel,
    };
  }

  // ── Ligne 4 : dossiers KYC archivés échus (clôture + 5 ans) ───────────────

  private async purgerKycEchusPostCloture(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(
      FinalitePurge.KYC_ECHEANCE_POST_CLOTURE,
      maintenant,
    );
    // Sélection auto-extinctive (idempotence sans colonne supplémentaire) : un
    // compte n'est éligible que s'il RESTE des données d'identité archivées ;
    // après traitement, plus rien ne matche.
    const resteArchive = `(
         (u.firstname IS NOT NULL AND u.firstname <> '')
      OR u.lastname IS NOT NULL
      OR EXISTS (SELECT 1 FROM kyc k
                 WHERE k."utilisateurId" = u."userId" AND k."identiteExtrait" IS NOT NULL)
      OR EXISTS (SELECT 1 FROM document d
                 WHERE d."userId" = u."userId" AND d."archiveConservationLegale")
      OR EXISTS (SELECT 1 FROM profil_personne_physique p
                 WHERE p."utilisateurId" = u."userId" AND p.nom <> '')
      OR EXISTS (SELECT 1 FROM beneficiaire_effectif b
                 WHERE b."profilPMId" = u."userId")
    )`;
    const eligiblesSql = `
      FROM users u
      WHERE u."anonymiseLe" IS NOT NULL
        AND u."anonymiseLe" < $1
        AND ${resteArchive}`;
    const suspendusLitige = await this.compterSuspendusLitige(eligiblesSql, [
      seuil,
    ]);
    const suspendusGel = await this.compterSuspendusGel(eligiblesSql, [seuil]);

    const traites = await this.parLots(async (limit) => {
      const rows: Array<{ userId: number }> = await this.dataSource.query(
        `SELECT u."userId" ${eligiblesSql}
           AND NOT ${this.existeReclamationOuverte('u')}
           AND ${CLAUSE_AVOIRS_NON_GELES}
         ORDER BY u."userId" LIMIT $2`,
        [seuil, limit],
      );
      for (const { userId } of rows) {
        await this.purgerDossierKycArchive(userId);
      }
      return rows.length;
    });

    return {
      finalite: FinalitePurge.KYC_ECHEANCE_POST_CLOTURE,
      traites,
      suspendusLitige,
      suspendusGel,
    };
  }

  /**
   * Échéance des 5 ans L. 561-12 CMF : destruction du dossier d'identité
   * archivé d'UN compte (pièces Cloudinary marquées « conservation légale »,
   * extrait d'identité Stripe, identité archivée du profil et du compte,
   * bénéficiaires effectifs). Les écritures comptables et contrats restent
   * intacts (10 ans, finalités distinctes).
   */
  private async purgerDossierKycArchive(userId: number): Promise<void> {
    // Fichiers d'abord (hors transaction, best-effort et rejouable) : si la
    // destruction distante échoue, la ligne `document` subsiste et le compte
    // reste éligible au prochain run.
    const docs: Array<{ id: string; path: string | null }> =
      await this.dataSource.query(
        `SELECT id, path FROM document
         WHERE "userId" = $1 AND "archiveConservationLegale"`,
        [userId],
      );
    for (const doc of docs) {
      if (doc.path && !doc.path.startsWith('http')) {
        await this.stockage.delete(doc.path);
      }
      await this.dataSource.query(`DELETE FROM document WHERE id = $1`, [
        doc.id,
      ]);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE kyc SET "identiteExtrait" = NULL, "fournisseurRef" = NULL
         WHERE "utilisateurId" = $1`,
        [userId],
      );
      await manager.query(
        `UPDATE profil_personne_physique
         SET civilite = NULL, prenom = '', nom = '', "nomNaissance" = NULL,
             "dateNaissance" = NULL, "lieuNaissance" = NULL,
             "paysNaissance" = NULL, nationalite = NULL, nif = NULL,
             profession = NULL, "secteurActivite" = NULL
         WHERE "utilisateurId" = $1`,
        [userId],
      );
      await manager.query(
        `DELETE FROM beneficiaire_effectif WHERE "profilPMId" = $1`,
        [userId],
      );
      await manager.query(
        `UPDATE users SET firstname = '', lastname = NULL WHERE "userId" = $1`,
        [userId],
      );
    });
  }

  // ── Ligne 11 : notifications (12 mois) ────────────────────────────────────

  private async purgerNotifications(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(FinalitePurge.NOTIFICATIONS, maintenant);
    const traites = await this.parLots(async (limit) => {
      const resultat = await this.dataSource.query(
        `DELETE FROM notification
         WHERE id IN (SELECT id FROM notification WHERE "createdAt" < $1 LIMIT $2)`,
        [seuil, limit],
      );
      return lignesAffectees(resultat);
    });
    return {
      finalite: FinalitePurge.NOTIFICATIONS,
      traites,
      suspendusLitige: 0,
      suspendusGel: 0,
    };
  }

  // ── Ligne 9 : journaux d'audit (5 ans) ────────────────────────────────────

  private async purgerJournauxAudit(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(FinalitePurge.JOURNAUX_AUDIT, maintenant);
    const traites = await this.parLots(async (limit) => {
      const resultat = await this.dataSource.query(
        `DELETE FROM audit_log
         WHERE id IN (SELECT id FROM audit_log WHERE "createdAt" < $1 LIMIT $2)`,
        [seuil, limit],
      );
      return lignesAffectees(resultat);
    });
    return {
      finalite: FinalitePurge.JOURNAUX_AUDIT,
      traites,
      suspendusLitige: 0,
      suspendusGel: 0,
    };
  }

  // ── Lot 4 : demandes d'accès porteur ──────────────────────────────────────

  /**
   * Texte libre d'une demande REFUSÉE, 2 ans après la décision.
   *
   * UPDATE et non DELETE : la motivation du demandeur et le complément interne
   * de l'instructeur sont des données personnelles sans obligation de
   * conservation propre, alors que le squelette de la décision (statut, dates,
   * administrateur, motif CODÉ) prouve l'examen exigé par les CGU et vit cinq
   * ans. Purger le texte SANS toucher à la décision est précisément ce que la
   * séparation motif codé / complément libre rend possible.
   *
   * Sélection auto-extinctive (idempotence sans colonne supplémentaire) : une
   * ligne déjà vidée ne matche plus.
   */
  private async purgerTexteLibreDemandesPorteur(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(
      FinalitePurge.DEMANDE_PORTEUR_TEXTE_LIBRE,
      maintenant,
    );
    const traites = await this.parLots(async (limit) => {
      const resultat = await this.dataSource.query(
        `UPDATE demande_acces_porteur
            SET motivation = '', "motifRefusComplement" = NULL
          WHERE id IN (
            SELECT id FROM demande_acces_porteur
             WHERE statut = 'refusee'
               AND "decideeLe" IS NOT NULL
               AND "decideeLe" < $1
               AND (motivation <> '' OR "motifRefusComplement" IS NOT NULL)
             LIMIT $2)`,
        [seuil, limit],
      );
      return lignesAffectees(resultat);
    });
    return {
      finalite: FinalitePurge.DEMANDE_PORTEUR_TEXTE_LIBRE,
      traites,
      suspendusLitige: 0,
      suspendusGel: 0,
    };
  }

  /**
   * Ligne de décision, 5 ans après la décision.
   *
   * Une demande ACCEPTÉE n'est éligible que si l'accès est REFERMÉ
   * (`users.porteurAccess = false`) : tant qu'il court, la pièce justifiant
   * son octroi doit rester. Le point de départ reste `decideeLe` faute de
   * date de révocation — limite documentée dans `retention-policy.ts`.
   */
  private async purgerDecisionsDemandesPorteur(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(FinalitePurge.DEMANDE_PORTEUR_DECISION, maintenant);
    const traites = await this.parLots(async (limit) => {
      const resultat = await this.dataSource.query(
        `DELETE FROM demande_acces_porteur
          WHERE id IN (
            SELECT d.id FROM demande_acces_porteur d
             WHERE d.statut IN ('acceptee','refusee','retiree','caduque')
               AND d."decideeLe" IS NOT NULL
               AND d."decideeLe" < $1
               AND (
                 d.statut <> 'acceptee'
                 OR NOT EXISTS (SELECT 1 FROM users u
                                 WHERE u."userId" = d."utilisateurId"
                                   AND u."porteurAccess")
               )
             LIMIT $2)`,
        [seuil, limit],
      );
      return lignesAffectees(resultat);
    });
    return {
      finalite: FinalitePurge.DEMANDE_PORTEUR_DECISION,
      traites,
      suspendusLitige: 0,
      suspendusGel: 0,
    };
  }

  /**
   * Caducité à 12 mois d'une demande JAMAIS instruite.
   *
   * La ligne part entièrement : il n'y a aucune décision à justifier, et la
   * conserver bloquerait indéfiniment l'index unique partiel — le demandeur ne
   * pourrait plus jamais redéposer. La caducité lui rend ce droit.
   */
  private async purgerDemandesPorteurCaduques(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(FinalitePurge.DEMANDE_PORTEUR_CADUQUE, maintenant);
    const traites = await this.parLots(async (limit) => {
      const resultat = await this.dataSource.query(
        `DELETE FROM demande_acces_porteur
          WHERE id IN (
            SELECT id FROM demande_acces_porteur
             WHERE statut IN ('soumise','en_examen')
               AND "soumiseLe" < $1
             LIMIT $2)`,
        [seuil, limit],
      );
      return lignesAffectees(resultat);
    });
    return {
      finalite: FinalitePurge.DEMANDE_PORTEUR_CADUQUE,
      traites,
      suspendusLitige: 0,
      suspendusGel: 0,
    };
  }

  // ── Outillage ─────────────────────────────────────────────────────────────

  /** Clause de suspension sur litige (réclamation ouverte). */
  private existeReclamationOuverte(alias: string): string {
    return `EXISTS (SELECT 1 FROM reclamation r
      WHERE r."utilisateurId" = ${alias}."userId"
        AND r.statut IN ${RECLAMATION_OUVERTE})`;
  }

  /** Compte les éligibles suspendus pour litige (journalisation, pas de traitement). */
  private async compterSuspendusLitige(
    eligiblesSql: string,
    params: unknown[] = [],
  ): Promise<number> {
    const [{ n }]: Array<{ n: string | number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n ${eligiblesSql}
         AND ${this.existeReclamationOuverte('u')}`,
      params,
    );
    return Number(n);
  }

  /**
   * Compte les éligibles suspendus pour gel des avoirs (journalisation, pas de
   * traitement). Un compte à la fois gelé ET en litige apparaît dans les deux
   * compteurs : ce sont deux motifs de suspension distincts, chacun tracé.
   */
  private async compterSuspendusGel(
    eligiblesSql: string,
    params: unknown[] = [],
  ): Promise<number> {
    const [{ n }]: Array<{ n: string | number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n ${eligiblesSql}
         AND u."avoirsGelesLe" IS NOT NULL`,
      params,
    );
    return Number(n);
  }

  /**
   * Suppression DÉFINITIVE d'un lot de comptes sans aucune donnée liée
   * (lignes 1 et 2 du barème) : enfants à clés étrangères d'abord, compte
   * ensuite, le tout atomique.
   */
  private async supprimerComptes(
    selectSql: string,
    params: unknown[],
  ): Promise<number> {
    const rows: Array<{ userId: number }> = await this.dataSource.query(
      selectSql,
      params,
    );
    if (rows.length === 0) return 0;
    const ids = rows.map((r) => r.userId);

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM notification WHERE "utilisateurId" = ANY($1)`,
        [ids],
      );
      await manager.query(`DELETE FROM mfa_methods WHERE user_id = ANY($1)`, [
        ids,
      ]);
      await manager.query(
        `DELETE FROM user_preferences WHERE "userId" = ANY($1)`,
        [ids],
      );
      await manager.query(
        `DELETE FROM profil_personne_physique WHERE "utilisateurId" = ANY($1)`,
        [ids],
      );
      // Demandes d'accès porteur (lot 4) : lignes enfants sans FK dure, mais
      // orphelines si le compte disparaît — et elles portent du texte libre
      // nominatif. Supprimées AVANT `users`, comme le reste.
      await manager.query(
        `DELETE FROM demande_acces_porteur WHERE "utilisateurId" = ANY($1)`,
        [ids],
      );
      await manager.query(`DELETE FROM user_emails WHERE user_id = ANY($1)`, [
        ids,
      ]);
      await manager.query(`DELETE FROM users WHERE "userId" = ANY($1)`, [ids]);
    });
    return ids.length;
  }

  /** Boucle par lots bornés : LIMIT systématique, plafond par run. */
  private async parLots(
    lot: (limit: number) => Promise<number>,
  ): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_LOTS_PAR_RUN; i++) {
      const n = await lot(TAILLE_LOT_PURGE);
      total += n;
      if (n < TAILLE_LOT_PURGE) break;
    }
    return total;
  }
}

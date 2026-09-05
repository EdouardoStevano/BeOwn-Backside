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
      await this.purgerConsentementCguPostCloture(maintenant),
      await this.purgerReclamationsCloses(maintenant),
      await this.purgerConsultationsProjet(maintenant),
      await this.purgerListeGelLevee(maintenant),
      // Lot 4 — trois passes sur `demande_acces_porteur`, dans cet ordre :
      // le texte libre part à 2 ans, la ligne d'une demande close à 5 ans après
      // la fin de l'accès, la demande jamais instruite à 12 mois.
      await this.purgerTexteLibreDemandesPorteur(maintenant),
      await this.purgerDecisionsDemandesPorteur(maintenant),
      await this.purgerDemandesPorteurJamaisInstruites(maintenant),
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
           AND NOT ${this.existeReclamation('u')}
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
    // `COALESCE(lastLoginAt, createdAt)` : le barème compte à partir du DERNIER
    // CONTACT ÉMANANT DU PROSPECT. `lastLoginAt` est désormais écrit à chaque
    // sign-in, second facteur et rafraîchissement de session réussis
    // (`UserRepository.touchLastLogin`) — jusque-là la colonne n'était jamais
    // renseignée et le repli sur `createdAt` faisait tout le travail : un
    // compte connecté la semaine dernière mais inscrit il y a plus de trois ans
    // était supprimé. Le repli ne couvre plus que le STOCK antérieur, dont on
    // ne sait rien.
    //
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
           AND NOT ${this.existeReclamation('u')}
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
      OR EXISTS (SELECT 1 FROM questionnaire_adequation q
                 WHERE q."utilisateurId" = u."userId")
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
      // La promesse du commentaire ci-dessus n'était pas tenue : la ligne
      // `document` partait même quand la destruction distante avait échoué —
      // le fichier restait chez le sous-traitant, sans plus aucune référence
      // pour le retrouver, et le compte cessait d'être éligible. La ligne n'est
      // désormais supprimée QUE si le fichier l'a été : le compte reste
      // sélectionné au run suivant, et la reprise est automatique.
      if (doc.path && !doc.path.startsWith('http')) {
        const detruit = await this.stockage.delete(doc.path);
        if (!detruit) {
          this.logger.warn(
            `Purge KYC du compte #${userId} : fichier ${doc.path} non détruit ` +
              `chez le fournisseur de stockage — ligne document conservée, ` +
              `nouvelle tentative au prochain run.`,
          );
          continue;
        }
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
             "residenceFiscale" = NULL,
             profession = NULL, "secteurActivite" = NULL,
             "patrimoineNetCalcule" = NULL,
             "seuilAvertissementCalcule" = NULL, "niveauRisque" = NULL
         WHERE "utilisateurId" = $1`,
        [userId],
      );
      await manager.query(
        `DELETE FROM beneficiaire_effectif WHERE "profilPMId" = $1`,
        [userId],
      );
      // Évaluation d'adéquation : la ligne entière part avec le dossier
      // d'identité. À l'anonymisation, seules ses VALEURS patrimoniales
      // déclarées avaient été effacées — le squelette (catégorie, critères
      // remplis, score du test, dates) survivait pour prouver que l'évaluation
      // de l'art. 21 avait eu lieu. Cinq ans après la clôture, plus rien ne le
      // justifie : c'est la même échéance que le reste de la connaissance
      // client (L. 561-12 CMF).
      await manager.query(
        `DELETE FROM questionnaire_adequation WHERE "utilisateurId" = $1`,
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

  // ── Ligne 8 : preuve de consentement CGU (clôture + 5 ans) ────────────────

  /**
   * Efface la preuve de consentement CGU — horodatage, version ET **IP
   * d'acceptation** — cinq ans après la clôture de la relation d'affaires.
   *
   * C'était la divergence la plus nette entre le code et le barème :
   * `AnonymizeAccountService` conserve ces trois champs À DESSEIN (art. 7.1
   * RGPD, charge de la preuve du consentement) et rien, ensuite, ne les
   * effaçait — l'IP d'acceptation d'un compte clos en 2026 serait encore là
   * en 2040.
   *
   * Point de départ : `users.anonymiseLe`, c'est-à-dire la clôture de la
   * relation d'affaires (règle transverse n° 2 du barème) — la même date que
   * la ligne 4, pour que les deux échéances tombent ensemble. Les comptes
   * supprimés en dur (finalités des lignes 1 et 2) n'ont rien à purger ici :
   * leur ligne `users` a disparu, IP comprise.
   *
   * UPDATE et non DELETE : la ligne `users` reste la clé technique à laquelle
   * s'adossent dix ans d'écritures comptables (ligne 6 du barème).
   *
   * Sélection auto-extinctive : une ligne déjà vidée des trois champs ne
   * matche plus, l'idempotence ne coûte aucune colonne supplémentaire.
   */
  private async purgerConsentementCguPostCloture(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(
      FinalitePurge.CONSENTEMENT_CGU_POST_CLOTURE,
      maintenant,
    );
    const eligiblesSql = `
      FROM users u
      WHERE u."anonymiseLe" IS NOT NULL
        AND u."anonymiseLe" < $1
        AND (u."cguAccepteesLe" IS NOT NULL
          OR u."cguVersionAcceptee" IS NOT NULL
          OR u."cguAcceptationIp" IS NOT NULL)`;
    const suspendusLitige = await this.compterSuspendusLitige(eligiblesSql, [
      seuil,
    ]);
    const suspendusGel = await this.compterSuspendusGel(eligiblesSql, [seuil]);

    const traites = await this.parLots(async (limit) => {
      const resultat = await this.dataSource.query(
        `UPDATE users
            SET "cguAccepteesLe" = NULL,
                "cguVersionAcceptee" = NULL,
                "cguAcceptationIp" = NULL
          WHERE "userId" IN (
            SELECT u."userId" ${eligiblesSql}
              AND NOT ${this.existeReclamationOuverte('u')}
              AND ${CLAUSE_AVOIRS_NON_GELES}
            ORDER BY u."userId" LIMIT $2)`,
        [seuil, limit],
      );
      return lignesAffectees(resultat);
    });

    return {
      finalite: FinalitePurge.CONSENTEMENT_CGU_POST_CLOTURE,
      traites,
      suspendusLitige,
      suspendusGel,
    };
  }

  // ── Ligne 15 : réclamations closes (clôture + 5 ans) ──────────────────────

  /**
   * Supprime les réclamations CLOSES cinq ans après leur clôture.
   *
   * Le barème déclarait la durée depuis le lot 2 ; aucune purge ne
   * l'appliquait — objet, description en texte libre et réponse de
   * l'assistance restaient indéfiniment.
   *
   * Point de départ : la clôture. La table ne porte pas de colonne dédiée ;
   * `reponduLe` la donne quand une réponse motivée a été envoyée, `updatedAt`
   * la donne sinon — pour une réclamation devenue terminale, la dernière
   * écriture EST la clôture. `COALESCE` dans cet ordre, jamais `createdAt` :
   * une réclamation instruite pendant des mois ne doit pas être purgée en
   * fonction de sa date de dépôt.
   *
   * Statuts terminaux SEULEMENT (`resolue`, `rejetee`) : une réclamation
   * encore ouverte a une finalité vivante, et le barème compte à partir de la
   * clôture. C'est aussi la cohérence avec la règle transverse n° 3 — une
   * réclamation ouverte suspend par ailleurs la purge du COMPTE concerné.
   */
  private async purgerReclamationsCloses(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(FinalitePurge.RECLAMATIONS, maintenant);
    const traites = await this.parLots(async (limit) => {
      const resultat = await this.dataSource.query(
        `DELETE FROM reclamation
          WHERE id IN (
            SELECT id FROM reclamation
             WHERE statut IN ('resolue','rejetee')
               AND COALESCE("reponduLe", "updatedAt") < $1
             LIMIT $2)`,
        [seuil, limit],
      );
      return lignesAffectees(resultat);
    });
    return {
      finalite: FinalitePurge.RECLAMATIONS,
      traites,
      suspendusLitige: 0,
      suspendusGel: 0,
    };
  }

  // ── Traces de consultation de projet (13 mois) ────────────────────────────

  /**
   * Supprime les traces de consultation du détail d'un projet passé 13 mois.
   *
   * `project_view` est une mesure d'audience NOMINATIVE (un `userId`, un
   * projet, une date) qui n'avait aucun terme. Sa finalité — repérer la
   * seconde consultation d'un même projet pour déclencher un contact — s'éteint
   * bien avant un an : la durée retenue est celle que la CNIL borne pour les
   * traceurs de mesure d'audience (ligne 13 du barème).
   */
  private async purgerConsultationsProjet(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(FinalitePurge.CONSULTATIONS_PROJET, maintenant);
    const traites = await this.parLots(async (limit) => {
      const resultat = await this.dataSource.query(
        `DELETE FROM project_view
          WHERE id IN (
            SELECT id FROM project_view WHERE "createdAt" < $1 LIMIT $2)`,
        [seuil, limit],
      );
      return lignesAffectees(resultat);
    });
    return {
      finalite: FinalitePurge.CONSULTATIONS_PROJET,
      traites,
      suspendusLitige: 0,
      suspendusGel: 0,
    };
  }

  // ── Liste interne de gel : inscriptions levées (levée + 5 ans) ────────────

  /**
   * Supprime les inscriptions RADIÉES de la liste interne de gel, cinq ans
   * après la levée de la mesure.
   *
   * Rien n'est purgé tant que `actif` est vrai : la mesure est en vigueur et
   * sa mise en œuvre est une obligation légale (art. L. 562-4 CMF). La
   * radiation est désormais horodatée (`desactiveLe`) — sans quoi il n'y avait
   * aucun point de départ calculable, et c'est précisément pour ça que ces
   * lignes n'avaient pas de durée.
   *
   * `desactiveLe IS NOT NULL` et non `actif = false` seul : le stock radié
   * AVANT la pose de la colonne n'a pas de date de levée. Le purger sur une
   * date inventée serait pire que de le laisser ; il est signalé au DPO par le
   * compteur ci-dessous plutôt que traité au jugé.
   */
  private async purgerListeGelLevee(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(FinalitePurge.LISTE_GEL_LEVEE, maintenant);
    const traites = await this.parLots(async (limit) => {
      const resultat = await this.dataSource.query(
        `DELETE FROM personne_gelee
          WHERE id IN (
            SELECT id FROM personne_gelee
             WHERE actif = false
               AND "desactiveLe" IS NOT NULL
               AND "desactiveLe" < $1
             LIMIT $2)`,
        [seuil, limit],
      );
      return lignesAffectees(resultat);
    });
    return {
      finalite: FinalitePurge.LISTE_GEL_LEVEE,
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
   * Ligne d'une demande CLOSE, 5 ans après la fin de ce qu'elle justifie.
   *
   * Une demande ACCEPTÉE n'est éligible que si l'accès est REFERMÉ
   * (`users.porteurAccess = false`) : tant qu'il court, la pièce justifiant
   * son octroi doit rester. Son POINT DE DÉPART n'est pas la date de décision
   * mais la FIN DE L'ACCÈS — le barème dit « durée de l'accès, puis 5 ans » :
   * `accesRevoqueLe` (retrait horodaté, lot 4b), à défaut `anonymiseLe`
   * (clôture de la relation d'affaires), à défaut `decideeLe` (stock antérieur
   * au lot 4b, ou ligne `users` disparue).
   *
   * Les autres statuts terminaux (refusée, retirée, caduque) n'ouvrent aucun
   * accès : leur point de départ reste la date de clôture du dossier.
   *
   * `LEFT JOIN` et non `EXISTS` : la sélection doit LIRE des colonnes de
   * `users`, et une demande dont le compte a été définitivement supprimé doit
   * rester purgeable (référence sans FK dure).
   */
  private async purgerDecisionsDemandesPorteur(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(
      FinalitePurge.DEMANDE_PORTEUR_DECISION,
      maintenant,
    );
    const traites = await this.parLots(async (limit) => {
      const resultat = await this.dataSource.query(
        `DELETE FROM demande_acces_porteur
          WHERE id IN (
            SELECT d.id FROM demande_acces_porteur d
             LEFT JOIN users u ON u."userId" = d."utilisateurId"
             WHERE d.statut IN ('acceptee','refusee','retiree','caduque')
               AND d."decideeLe" IS NOT NULL
               AND (d.statut <> 'acceptee' OR NOT COALESCE(u."porteurAccess", false))
               AND CASE
                     WHEN d.statut = 'acceptee'
                       THEN COALESCE(u."accesRevoqueLe", u."anonymiseLe", d."decideeLe")
                     ELSE d."decideeLe"
                   END < $1
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
   * Demande JAMAIS INSTRUITE, 12 mois après son dépôt.
   *
   * La ligne part entièrement : il n'y a aucune décision à justifier, et la
   * conserver bloquerait indéfiniment l'index unique partiel — le demandeur ne
   * pourrait plus jamais redéposer. Ce n'est PAS le statut `caduque` (terminal
   * et horodaté, purgé par la finalité précédente) : ce sont les dossiers
   * restés `soumise` ou `en_examen`.
   */
  private async purgerDemandesPorteurJamaisInstruites(
    maintenant: Date,
  ): Promise<CompteurFinalite> {
    const seuil = seuilPurge(
      FinalitePurge.DEMANDE_PORTEUR_JAMAIS_INSTRUITE,
      maintenant,
    );
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
      finalite: FinalitePurge.DEMANDE_PORTEUR_JAMAIS_INSTRUITE,
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

  /**
   * Clause « le compte a déposé une réclamation, quelle qu'elle soit ».
   *
   * Réservée aux deux finalités qui SUPPRIMENT la ligne `users` en dur
   * (lignes 1 et 2 du barème) : la table `reclamation` n'a pas de clé étrangère
   * vers `users`, un compte effacé y laisserait donc un fil nominatif orphelin.
   * Or ce fil vit cinq ans après sa clôture (ligne 15) — il n'est pas question
   * de l'emporter avec le compte, ni de laisser le compte partir sans lui. Le
   * compte attend : la finalité `reclamations` purgera le fil à son échéance,
   * après quoi le compte redeviendra éligible tout seul.
   *
   * Plus stricte que `existeReclamationOuverte`, qu'elle englobe : un compte
   * sans aucune réclamation n'en a évidemment aucune d'ouverte. Le compteur
   * `suspendusLitige` garde donc son sens exact (éligible + litige en cours).
   */
  private existeReclamation(alias: string): string {
    return `EXISTS (SELECT 1 FROM reclamation r
      WHERE r."utilisateurId" = ${alias}."userId")`;
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
      // Deux tables sans clé étrangère vers `users` qu'un prospect peut
      // pourtant alimenter sans jamais engager de KYC : l'évaluation
      // d'adéquation (montants patrimoniaux déclarés) et les traces de
      // consultation de projet. Les gardes `NOT EXISTS` de la sélection ne les
      // couvrent pas — elles portent sur kyc/wallet/investissement/document —
      // et les laisser derrière ferait de la « purge complète » un
      // mensonge : deux lignes nominatives survivraient au compte.
      await manager.query(
        `DELETE FROM questionnaire_adequation WHERE "utilisateurId" = ANY($1)`,
        [ids],
      );
      await manager.query(`DELETE FROM project_view WHERE "userId" = ANY($1)`, [
        ids,
      ]);
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

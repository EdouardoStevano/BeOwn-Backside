import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le titulaire peut déposer sa pièce d'identité pour la revue manuelle.
 *
 * Jusqu'ici, un dossier que Stripe Identity refusait ou renvoyait en revue
 * n'avait **aucun chemin de recours** : `RequestKycManualReviewUseCase` faisait
 * passer le dossier en `EN_REVUE`, mais l'équipe conformité se retrouvait devant
 * un dossier vide — le fournisseur garde les images qu'il a capturées, et il n'y
 * en a aucune quand il n'a jamais abouti. Cette colonne porte ce que le
 * titulaire donne à lire à l'humain.
 *
 * **Une colonne `jsonb`, et non douze colonnes à plat** comme pour les
 * justificatifs de société : rien ici ne se filtre ni ne se trie — on lit ce
 * document pour l'instruire, jamais pour chercher parmi d'autres. La colonne
 * `identiteExtrait` de la même table fait déjà ce choix, et les deux se
 * ressemblent sans se confondre : celle-là est ce que **le fournisseur** a lu
 * sur la pièce qu'il a capturée, celle-ci est ce que le **titulaire** dépose.
 *
 * Elle ne remet pas en cause la règle « une seule source par fait » que le
 * cahier des charges impose, et pour laquelle `TypePieceJustificative` exclut
 * expressément la pièce du titulaire : cette exclusion vaut tant que le
 * fournisseur a **su** décider. Le dépôt manuel est refusé sur un dossier déjà
 * validé et non périmé — c'est un recours, pas un second chemin.
 *
 * Aucune reprise de données : la colonne naît nulle partout, et un dossier sans
 * pièce déposée est l'état normal de tout titulaire dont la vérification
 * automatique a abouti.
 */
export class PieceIdentiteDeposeePourLaRevueManuelle1784900000000 implements MigrationInterface {
  name = 'PieceIdentiteDeposeePourLaRevueManuelle1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kyc" ADD COLUMN IF NOT EXISTS "pieceIdentiteDeposee" jsonb`,
    );

    // Le recours ne concerne que les dossiers en attente d'un examen humain.
    // Index partiel : la file d'instruction de la conformité les balaie, et ils
    // sont une poignée face aux dossiers auto-validés.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_kyc_piece_identite_a_instruire"
        ON "kyc" ("statut")
        WHERE "pieceIdentiteDeposee" IS NOT NULL
    `);
  }

  /**
   * Retour arrière : les pièces déposées sont perdues.
   *
   * Les octets, eux, restent dans le magasin sous `conformite/titulaires/{id}` —
   * ce sont les références qui disparaissent. Rien ne les retrouvera ensuite :
   * redescendre suppose donc d'accepter que ces dossiers redeviennent
   * ininstruisables.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_kyc_piece_identite_a_instruire"`,
    );
    await queryRunner.query(
      `ALTER TABLE "kyc" DROP COLUMN IF EXISTS "pieceIdentiteDeposee"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le verdict KYB d'une société devient un **état daté**, plutôt qu'un calcul
 * refait à chaque lecture.
 *
 * `aptitudeDeLaSociete` le recomposait depuis trois agrégats — le dossier de
 * conformité du représentant, la société, ses justificatifs. Un verdict
 * recalculé bascule en silence : le jour où un KBIS se périme ou qu'un
 * bénéficiaire est déclaré de plus, la société cesse ou recommence de pouvoir
 * opérer sans qu'aucune décision ait été prise. Le régulateur, lui, attend de
 * savoir *qui* a validé *quoi* et *quand* — d'où `kybDecideePar` et
 * `kybDecideeLe`, qui n'existaient nulle part.
 *
 * **Cinq colonnes sur la ligne du profil investisseur**, et non une table à
 * part comme `kyc` : la décision n'a pas d'identité propre ni de cycle de vie
 * hors de sa racine, et cinq attributs. C'est la situation du classement PSFP
 * et de la surveillance périodique, déjà rangés ici à plat par
 * `ClassementEtSuiviQuittentProfilPP` et `DossierDeConformiteAUneTable`.
 *
 * **Aucune reprise de données.** Les lignes existantes prennent
 * `en_constitution`, y compris celles des sociétés : c'est le seul défaut
 * acceptable — se tromper dans l'autre sens laisserait opérer une société que
 * personne n'a instruite. Concrètement, les sociétés dont le dossier était
 * matériellement complet redeviennent inaptes jusqu'à ce que l'équipe
 * conformité les valide ; c'est exactement ce que la bascule cherche à rendre
 * possible, et il n'existe aucune trace en base permettant de valider
 * rétroactivement en nommant un décideur.
 *
 * Les colonnes existent aussi sur la ligne d'un titulaire, qui n'a pas de KYB :
 * une table est rectangulaire, le modèle ne l'est pas, et c'est `souscripteur`
 * qui décide lequel des deux signaux fait foi (cf. `ClassementPsfp`).
 */
export class DecisionKybSurLeDossierDeConformite1784700000000 implements MigrationInterface {
  name = 'DecisionKybSurLeDossierDeConformite1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "investor_compliance_profile"
        ADD COLUMN IF NOT EXISTS "kybStatut" varchar NOT NULL DEFAULT 'en_constitution',
        ADD COLUMN IF NOT EXISTS "kybMotifRefus" text,
        ADD COLUMN IF NOT EXISTS "kybValideJusquAu" date,
        ADD COLUMN IF NOT EXISTS "kybDecideeLe" timestamptz,
        ADD COLUMN IF NOT EXISTS "kybDecideePar" int
    `);

    // Le décideur est un compte : sans cette contrainte, un agent supprimé
    // laisserait une décision signée d'un identifiant qui ne désigne plus
    // personne. `SET NULL` plutôt que `CASCADE` — la décision reste, c'est son
    // auteur qui disparaît, et effacer le verdict rouvrirait l'accès aux
    // opérations financières au départ d'un salarié.
    //
    // `users("userId")` : la table nomme sa clé primaire d'après l'entité, pas
    // `id`. Voir `UserEntity`.
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" DROP CONSTRAINT IF EXISTS "FK_icp_kyb_decideur"`,
    );
    await queryRunner.query(`
      ALTER TABLE "investor_compliance_profile"
        ADD CONSTRAINT "FK_icp_kyb_decideur"
        FOREIGN KEY ("kybDecideePar") REFERENCES "users"("userId") ON DELETE SET NULL
    `);

    // Indexé pour la file d'instruction du back-office : « les dossiers KYB qui
    // attendent une décision » est la seule lecture qui balaie cette colonne,
    // et elle est très sélective — la plupart des lignes sont des titulaires.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_icp_kyb_en_instruction"
        ON "investor_compliance_profile" ("kybStatut")
        WHERE "souscripteurSocieteId" IS NOT NULL
    `);
  }

  /**
   * Retour arrière : les décisions KYB sont perdues.
   *
   * Rien à préserver ailleurs — ces colonnes sont le seul endroit où le verdict
   * ait jamais été écrit. Redescendre rend son ancien comportement à
   * `aptitudeDeLaSociete`, qui recalculera la complétude à la lecture.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_icp_kyb_en_instruction"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" DROP CONSTRAINT IF EXISTS "FK_icp_kyb_decideur"`,
    );
    await queryRunner.query(`
      ALTER TABLE "investor_compliance_profile"
        DROP COLUMN IF EXISTS "kybStatut",
        DROP COLUMN IF EXISTS "kybMotifRefus",
        DROP COLUMN IF EXISTS "kybValideJusquAu",
        DROP COLUMN IF EXISTS "kybDecideeLe",
        DROP COLUMN IF EXISTS "kybDecideePar"
    `);
  }
}

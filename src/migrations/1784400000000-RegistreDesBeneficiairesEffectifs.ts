import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le registre des bénéficiaires effectifs distingue détention directe et
 * indirecte, et cesse de porter une clé de document morte.
 *
 * **`modeDetention` arrive** parce que le cahier des charges le demande — *« 25 %
 * et plus des parts de la société de manière **directe ou indirecte** »* — et
 * que la distinction change une règle : seules les parts directes se partagent
 * le capital, donc seules elles sont plafonnées à 100 % au total. Les
 * indirectes se superposent (une personne contrôlant une holding qui détient
 * 60 % est bénéficiaire à 60 % indirects, part qui recouvre celle de la
 * holding). Les additionner ferait refuser des registres réguliers.
 *
 * Les lignes existantes prennent `directe` : c'est le cas ordinaire, celui
 * qu'on déclare en remplissant un DBE-S1 sans schéma de participation, et le
 * seul que l'ancien formulaire permettait d'exprimer.
 *
 * **`pieceIdentiteDocId` part.** C'était un `varchar` nullable que le DTO
 * pouvait remplir sans qu'aucun code ne le lise, ni ne vérifie qu'il désignait
 * un document existant, ni qu'il appartenait au bon dossier. Le rattachement va
 * désormais dans l'autre sens : `piece_justificative.beneficiaireId` pointe
 * vers cette ligne, et la pièce porte en plus son type, son statut
 * d'instruction et son motif de refus — ce qu'une clé nue ne pouvait pas dire.
 *
 * La colonne est **relue avant d'être supprimée** : si des identifiants y
 * traînent, la migration s'arrête plutôt que de les perdre en silence. Rien ne
 * les consommait, mais ce sont peut-être des références déposées à la main.
 */
export class RegistreDesBeneficiairesEffectifs1784400000000 implements MigrationInterface {
  name = 'RegistreDesBeneficiairesEffectifs1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" ADD COLUMN IF NOT EXISTS "modeDetention" character varying NOT NULL DEFAULT 'directe'`,
    );
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" DROP CONSTRAINT IF EXISTS "CHK_beneficiaire_mode_detention"`,
    );
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" ADD CONSTRAINT "CHK_beneficiaire_mode_detention" CHECK ("modeDetention" IN ('directe', 'indirecte'))`,
    );

    await queryRunner.query(`
      DO $$
      DECLARE renseignes bigint;
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'beneficiaire_effectif'
            AND column_name = 'pieceIdentiteDocId'
        ) THEN
          SELECT count(*) INTO renseignes
          FROM "beneficiaire_effectif"
          WHERE "pieceIdentiteDocId" IS NOT NULL;

          IF renseignes > 0 THEN
            RAISE EXCEPTION
              '% bénéficiaire(s) portent un pieceIdentiteDocId. Redéposez ces pièces par /profiles/pm/:societeId/pieces avant de rejouer la migration.',
              renseignes;
          END IF;

          ALTER TABLE "beneficiaire_effectif" DROP COLUMN "pieceIdentiteDocId";
        END IF;
      END $$;
    `);
  }

  /**
   * Retour arrière.
   *
   * `pieceIdentiteDocId` revient vide : les pièces d'identité déposées depuis
   * vivent dans `piece_justificative`, avec un type et une instruction que
   * cette colonne ne sait pas représenter. Les y recopier perdrait leur statut
   * et ferait croire à des pièces acceptées.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" ADD COLUMN IF NOT EXISTS "pieceIdentiteDocId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" DROP CONSTRAINT IF EXISTS "CHK_beneficiaire_mode_detention"`,
    );
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" DROP COLUMN IF EXISTS "modeDetention"`,
    );
  }
}

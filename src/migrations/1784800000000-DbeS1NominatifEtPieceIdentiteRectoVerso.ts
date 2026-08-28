import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deux corrections du modèle des pièces du dossier personne morale.
 *
 * **1. Le DBE-S1 devient nominatif.** Il était compté parmi les pièces de la
 * société, aux côtés du KBIS, des statuts et de la liste des actionnaires. Il
 * n'y avait pas sa place : c'est le document *relatif au bénéficiaire effectif*,
 * il s'en dépose un par personne déclarée. Le compter une fois par société
 * rendait complet un dossier de trois actionnaires ne portant le formulaire que
 * d'un seul d'entre eux — exactement le trou que le registre des bénéficiaires
 * existe pour fermer.
 *
 * Les trois autres restent rattachées à la société seule, et c'est leur nature
 * qui le veut : l'extrait atteste **son** immatriculation, les statuts **ses**
 * règles, la liste **son** actionnariat pris comme un tout. Aucun ne désigne
 * une personne.
 *
 * **2. La pièce d'identité se dépose recto ET verso.** Sur une carte
 * d'identité, la date d'expiration, l'adresse et la bande MRZ sont au dos :
 * instruire sur le seul recto revient à accepter un document sans pouvoir
 * vérifier qu'il est encore valide.
 *
 * Cinq colonnes de plus sur la **même ligne**, et non une seconde ligne : les
 * deux faces forment un document unique, avec une seule décision d'instruction.
 * Deux lignes auraient permis d'accepter un recto et de refuser son verso, et
 * fait mentir `UQ_piece_societe_type_beneficiaire`, qui compte une pièce par
 * (société, type, bénéficiaire).
 *
 * **Les DBE-S1 existants sont supprimés.** Ils portent `beneficiaireId IS
 * NULL`, ce qui n'est plus un état représentable — le domaine refuse désormais
 * un DBE-S1 qui ne dit pas qui il documente. Les rattacher au hasard à l'un des
 * bénéficiaires de leur société attribuerait à une personne un formulaire qui
 * n'est peut-être pas le sien, ce qui est pire qu'un dossier à recompléter.
 * L'application n'a pas de version en production ; en dev, le titulaire
 * redépose un formulaire par bénéficiaire.
 */
export class DbeS1NominatifEtPieceIdentiteRectoVerso1784800000000 implements MigrationInterface {
  name = 'DbeS1NominatifEtPieceIdentiteRectoVerso1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "piece_justificative"
        ADD COLUMN IF NOT EXISTS "versoNomOrigine" varchar,
        ADD COLUMN IF NOT EXISTS "versoCleStockage" varchar,
        ADD COLUMN IF NOT EXISTS "versoUrl" varchar,
        ADD COLUMN IF NOT EXISTS "versoMimeType" varchar,
        ADD COLUMN IF NOT EXISTS "versoTailleOctets" int
    `);

    // Les DBE-S1 de société n'ont plus de sens : le type est nominatif.
    await queryRunner.query(`
      DELETE FROM "piece_justificative"
      WHERE "type" = 'dbe_s1' AND "beneficiaireId" IS NULL
    `);
  }

  /**
   * Retour arrière : les versos sont perdus, et avec eux la moitié des pièces
   * d'identité déposées.
   *
   * Rien à préserver ailleurs — ces colonnes sont le seul endroit où le dos
   * d'un document ait été enregistré. Les DBE-S1 supprimés à la montée ne
   * reviennent pas non plus : redescendre rétablit la règle qui n'en réclamait
   * qu'un par société, pas les lignes qu'elle acceptait.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "piece_justificative"
        DROP COLUMN IF EXISTS "versoNomOrigine",
        DROP COLUMN IF EXISTS "versoCleStockage",
        DROP COLUMN IF EXISTS "versoUrl",
        DROP COLUMN IF EXISTS "versoMimeType",
        DROP COLUMN IF EXISTS "versoTailleOctets"
    `);
  }
}

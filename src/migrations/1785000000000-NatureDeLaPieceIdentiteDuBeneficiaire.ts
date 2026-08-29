import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La pièce d'identité d'un bénéficiaire dit **quel document** elle est.
 *
 * Elle était traitée comme un document unique, toujours recto-verso. Or
 * « pièce d'identité » ne désigne pas un document mais une famille de quatre —
 * carte nationale d'identité, passeport, permis de conduire, titre de séjour —
 * et ils ne se prouvent pas de la même façon : seule la carte porte au dos sa
 * date d'expiration et sa bande MRZ, les trois autres tiennent sur une page.
 * Exiger un verso de tous rendait le passeport **indéposable**, alors que c'est
 * la pièce la plus courante pour un bénéficiaire non résident.
 *
 * La colonne porte la nature, et c'est elle — non le type — qui décide
 * désormais du verso. Le jeu des quatre documents et la règle du recto-verso
 * sont **partagés avec le dépôt manuel du titulaire** (`TypePieceIdentite`,
 * `PIECES_IDENTITE_RECTO_VERSO`) : deux tables séparées auraient fini par
 * diverger, un passeport accepté sans verso d'un côté et refusé de l'autre.
 *
 * **Hors de la contrainte d'unicité**, délibérément. `UQ_piece_societe_type_beneficiaire`
 * continue de compter une pièce par (société, type, bénéficiaire) : une personne
 * ne dépose **qu'une** pièce d'identité, quelle qu'elle soit. Ajouter la nature
 * à la clé aurait laissé coexister sa carte d'identité et son passeport, sans
 * qu'on sache lequel fait foi.
 *
 * Aucune reprise de données : la colonne naît nulle, et une pièce d'identité
 * sans nature reste lisible — le mapper ne rejoue aucune règle au chargement
 * (§16). Elle devra en revanche en déclarer une au prochain dépôt, la règle
 * s'appliquant là où une valeur *entre*.
 */
export class NatureDeLaPieceIdentiteDuBeneficiaire1785000000000 implements MigrationInterface {
  name = 'NatureDeLaPieceIdentiteDuBeneficiaire1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "piece_justificative" ADD COLUMN IF NOT EXISTS "natureIdentite" varchar`,
    );
  }

  /**
   * Retour arrière : les natures sont perdues, et avec elles la seule façon de
   * savoir si un dos manque à une pièce déposée.
   *
   * Redescendre rétablit la règle qui exigeait un verso de toute pièce
   * d'identité — les passeports déposés entre-temps deviennent alors des
   * dossiers que l'instruction tiendra pour incomplets.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "piece_justificative" DROP COLUMN IF EXISTS "natureIdentite"`,
    );
  }
}

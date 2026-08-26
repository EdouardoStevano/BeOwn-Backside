import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { NatureDeDossier } from 'src/compliance/domain/enums/nature-de-dossier.enum';
import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';

/**
 * Une ligne par compte ayant ouvert un dossier : sa nature, et rien d'autre.
 *
 * La table n'existe pas pour être lue — aucune route ne la sert — mais pour
 * que l'exclusivité PP / PM soit une **contrainte** et non une vérification.
 * `profil_personne_physique` et `profil_personne_morale` portent chacune une
 * colonne `nature` figée à leur valeur, et référencent ce registre par clé
 * étrangère composée `(userId, nature)`. Un dossier moral sur un compte inscrit
 * « PP » ne trouve donc aucune ligne à référencer, et l'insertion échoue — quoi
 * qu'ait pu conclure le code appelant, et quel que soit l'entrelacement de deux
 * requêtes simultanées.
 *
 * C'est la seule façon d'obtenir une garantie **déclarative** sur un invariant
 * qui porte sur deux tables : Postgres ne sait pas exprimer « cette ligne
 * interdit celle-là, là-bas » autrement qu'en passant par une table commune.
 * L'alternative — un trigger — enfouirait une règle métier dans le schéma, là
 * où personne ne la lit et où aucun test unitaire ne l'atteint.
 *
 * Le fait reste modélisé côté domaine : c'est `NatureDuDossierRepository` qui
 * le pose, et les use cases de création qui refusent, avec une erreur métier
 * qui s'explique. Cette table est le filet, pas la règle.
 *
 * **Elle porte désormais aussi la surveillance périodique** (PSFP art. 21), et
 * devient de ce fait la table de `InvestorComplianceProfile` : le premier état
 * que la racine possède en propre, tout le reste de ce qu'elle publie étant
 * dérivé de ses deux pièces. Ces trois colonnes vivaient sur
 * `profil_personne_physique`, ce qui rendait toute surveillance impossible
 * pour une personne morale — elle n'a pas de ligne dans cette table-là.
 */
@Entity('dossier_investisseur')
export class DossierInvestisseurEntity {
  @PrimaryColumn()
  userId: number;

  @Column({ type: 'varchar', length: 2 })
  nature: NatureDeDossier;

  /** Cadence de contact appelée par les réponses au questionnaire. */
  @Column({ type: 'varchar', nullable: true })
  niveauRisque: NiveauRisque | null;

  @Column({ type: 'timestamptz', nullable: true })
  dernierContactAdmin: Date | null;

  /** Indexée : le CRON quotidien balaie la table entière par cette colonne. */
  @Column({ type: 'timestamptz', nullable: true })
  @Index()
  prochainContactDu: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

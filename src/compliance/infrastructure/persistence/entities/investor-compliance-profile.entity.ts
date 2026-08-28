import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';

/**
 * Le dossier de conformité d'un titulaire — la table de la racine.
 *
 * Elle s'appelait `dossier_investisseur` et ne portait que la nature du
 * dossier, pour garantir une exclusivité PP ⊻ PM que le cahier des charges ne
 * demandait pas. Elle est devenue la table de `InvestorComplianceProfile` en
 * quatre temps : la surveillance périodique s'y est installée, puis le
 * classement PSFP, puis les deux pièces s'y sont rattachées, et enfin la nature
 * — sa raison d'être initiale — en est partie.
 *
 * **C'est le seul point de ce contexte qui connaisse le compte.** `kyc` et
 * `questionnaire_adequation` portaient chacune un `utilisateurId` vers `users`,
 * c'est-à-dire que deux entités internes se rattachaient au titulaire
 * par-dessus leur racine — on pouvait lire un dossier de vérification sans
 * jamais passer par le dossier de conformité qui le contient (§6). Elles
 * référencent désormais `id`, et rien d'autre.
 *
 * Trois relations, toutes 1:1 :
 *
 * | Vers                       | Portée par                          |
 * | -------------------------- | ----------------------------------- |
 * | `users`                    | `userId`, unique et non nul         |
 * | `kyc`                      | `kyc.profileId`, unique             |
 * | `questionnaire_adequation` | `questionnaire.profileId`, unique   |
 */
@Entity('investor_compliance_profile')
export class InvestorComplianceProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Le titulaire — relation 1:1, par identité seule et sans relation ORM.
   *
   * Un compte a au plus un dossier de conformité, et un dossier n'existe pas
   * sans compte : `unique` et `NOT NULL` le disent, la clé étrangère vers
   * `users` l'impose.
   */
  @Column()
  @Index({ unique: true })
  userId: number;

  // La colonne `nature` a disparu, avec la clé étrangère composée
  // `(userId, nature)` par laquelle les deux tables de profils s'interdisaient
  // mutuellement. Un compte relève des deux régimes à la fois : il a un dossier
  // personne physique — son identité, celle du représentant légal — et autant
  // de sociétés qu'il en représente. Une nature unique n'était donc plus
  // décidable, et ce qu'elle prétendait dire se lit sans elle : un dossier
  // physique existe ou non, des sociétés sont déclarées ou non. Voir
  // `ProfilsPPEtPMCoexistent1784100000000`.

  // ── Le classement PSFP ─────────────────────────────────────────────────
  //
  // Trois colonnes qui vivaient sur `profil_personne_physique`, où le profil
  // n'en tenait qu'une copie de ce que le questionnaire calcule — et où une
  // personne morale n'était donc classée nulle part. La racine les contrôle :
  // elle les pose elle-même en enregistrant les réponses.

  @Column({ type: 'varchar', default: CategoriePsfp.NON_AVERTI })
  categoriePsfp: CategoriePsfp;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  patrimoineDeclare: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  montantMaxConseille: number | null;

  // ── La surveillance périodique (PSFP art. 21) ──────────────────────────

  @Column({ type: 'varchar', nullable: true })
  niveauRisque: NiveauRisque | null;

  @Column({ type: 'timestamptz', nullable: true })
  dernierContactAdmin: Date | null;

  /** Indexée : le CRON quotidien balaie la table par cette colonne. */
  @Column({ type: 'timestamptz', nullable: true })
  @Index()
  prochainContactDu: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

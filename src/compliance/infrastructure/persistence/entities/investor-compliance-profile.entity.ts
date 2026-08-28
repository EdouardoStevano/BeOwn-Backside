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
import { StatutKyb } from 'src/compliance/domain/enums/statut-kyb.enum';

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
  @Index()
  userId: number;

  /**
   * La société dont ce dossier porte le classement — `null` pour celui du
   * titulaire lui-même.
   *
   * **Un dossier par profil investisseur, et non plus par compte.** Le
   * classement PSFP s'apprécie sur l'investisseur : une SAS peut être
   * professionnelle quand son dirigeant est non-averti, et lui opposer le
   * plafond de son représentant lui imposerait un délai de rétractation qui ne
   * la concerne pas.
   *
   * Le **KYC reste sur la ligne du titulaire** (`societeId` nul) : c'est une
   * identité de personne physique, et le cahier des charges veut précisément
   * qu'elle ne soit pas ressaisie par société. Ce qu'une société a en propre,
   * c'est son KYB — qui vit dans `piece_justificative` — et son questionnaire.
   *
   * L'unicité tient à deux index partiels : `NULL` n'étant jamais égal à `NULL`
   * dans un index unique Postgres, une contrainte à deux colonnes laisserait
   * passer autant de lignes de titulaire qu'on veut.
   */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  souscripteurSocieteId: string | null;

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

  // ── Le dossier KYB de la société ───────────────────────────────────────
  //
  // Cinq colonnes qui n'ont de sens que sur une ligne de société
  // (`souscripteurSocieteId` non nul) : une personne physique prouve son
  // identité par `kyc`, une société son existence légale par ses
  // justificatifs. La ligne d'un titulaire les porte donc à leur valeur
  // initiale, comme elle porte un classement qu'elle n'a pas gagné — une table
  // est rectangulaire, le modèle ne l'est pas (cf. `ClassementPsfp`).
  //
  // Elles remplacent un verdict qui n'était stocké nulle part :
  // `aptitudeDeLaSociete` le recomposait à chaque lecture depuis trois
  // agrégats, donc sans date, sans auteur, et basculant en silence dès qu'un
  // KBIS se périmait.

  @Column({ type: 'varchar', default: StatutKyb.EN_CONSTITUTION })
  kybStatut: StatutKyb;

  @Column({ type: 'text', nullable: true })
  kybMotifRefus: string | null;

  /**
   * `date` et non `timestamptz` : une échéance de validité n'a ni heure ni
   * fuseau — même choix que `kyc.valideJusquAu`, et les deux se comparent par
   * la même règle.
   */
  @Column({ type: 'date', nullable: true })
  kybValideJusquAu: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  kybDecideeLe: Date | null;

  /** Le compte de l'agent conformité qui a tranché — jamais le titulaire. */
  @Column({ type: 'int', nullable: true })
  kybDecideePar: number | null;

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

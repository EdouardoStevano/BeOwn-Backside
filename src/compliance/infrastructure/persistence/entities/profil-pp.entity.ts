import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';

@Entity('profil_personne_physique')
export class ProfilPPEntity {
  /** Identité propre du dossier — voir `EnteteProfilPP.id`. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Le titulaire est référencé **par son identité seule** — pas par une
   * relation vers `UserEntity`.
   *
   * La relation existait sans être lue nulle part, et coûtait un import de
   * l'entité ORM d'IAM : Profiles dépendait donc de l'infrastructure d'un autre
   * contexte pour une jointure qu'il ne faisait jamais (§12.7). Un agrégat
   * référence un autre agrégat par identifiant, jamais par objet — la frontière
   * d'agrégat est aussi la frontière du chargement.
   *
   * `unique` porte le 1:1 : un compte a au plus un dossier personne physique.
   * C'était auparavant la clé primaire qui l'imposait, en confondant les deux
   * identités.
   *
   * Ce décorateur ne dit rien de la **référence** : c'est
   * `ProfilPPOwnIdentity1783700000000` qui pose la clé étrangère vers
   * `users("userId")`, en `ON DELETE NO ACTION`. La garantie est en base et non
   * dans le mapping, délibérément — un `@OneToOne` vers `UserEntity` ferait
   * dépendre ce contexte de l'infrastructure d'IAM pour une jointure qu'il ne
   * fait jamais, ce que la note ci-dessus a justement défait. Le schéma protège
   * l'invariant, l'agrégat ne charge que ce qui le regarde.
   */
  @Column({ unique: true })
  userId: number;

  @Column({ type: 'varchar', nullable: true })
  civilite: string | null;

  @Column({ type: 'varchar', nullable: true })
  nomNaissance: string | null;

  @Column({ type: 'date', nullable: true })
  dateNaissance: Date | null;

  @Column({ type: 'varchar', nullable: true })
  lieuNaissance: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  paysNaissance: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  nationalite: string | null;

  /** Canal de rappel du conseil PSFP — déclaré avec le reste des coordonnées. */
  @Column({ type: 'varchar', nullable: true })
  telephone: string | null;

  @Column({ type: 'varchar', nullable: true })
  adresseLigne1: string | null;

  @Column({ type: 'varchar', nullable: true })
  adresseLigne2: string | null;

  @Column({ type: 'varchar', nullable: true })
  codePostal: string | null;

  @Column({ type: 'varchar', nullable: true })
  ville: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  pays: string | null;

  @Column({ type: 'varchar', nullable: true })
  profession: string | null;

  @Column({ type: 'varchar', nullable: true })
  secteurActivite: string | null;

  @Column({ default: false })
  pep: boolean;

  @Column({ type: 'char', length: 2, nullable: true })
  residenceFiscale: string | null;

  @Column({ type: 'varchar', nullable: true })
  nif: string | null;

  @Column({ type: 'varchar', default: CategoriePsfp.NON_AVERTI })
  categoriePsfp: CategoriePsfp;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  patrimoineDeclare: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  montantMaxConseille: number | null;

  @Column({ type: 'varchar', nullable: true })
  niveauRisque: string | null; // 'vulnerable' | 'modere' | 'qualifie'

  @Column({ type: 'timestamptz', nullable: true })
  dernierContactAdmin: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  prochainContactDu: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { CategorieInvestisseur } from 'src/profiles/domains/investor-classification';
import { LienAvecPrestataire } from 'src/projects/domains/conflits-interets';

@Entity('profil_personne_physique')
export class ProfilPPEntity {
  @PrimaryColumn()
  utilisateurId: number;

  @OneToOne(() => UserEntity)
  @JoinColumn({ name: 'utilisateurId' })
  utilisateur: UserEntity;

  @Column({ type: 'varchar', nullable: true })
  civilite: string | null;

  @Column({ type: 'varchar' })
  prenom: string;

  @Column({ type: 'varchar' })
  nom: string;

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
  telephone: string | null;

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

  @Column({ type: 'varchar', default: CategorieInvestisseur.NON_AVERTI })
  categoriePsfp: CategorieInvestisseur;

  /** Patrimoine net au sens de l'art. 21(5) du règlement (UE) 2020/1503. */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  patrimoineNetCalcule: number | null;

  /** max(1 000 €, 5 % du patrimoine net) — seuil d'avertissement art. 21(7). */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  seuilAvertissementCalcule: number | null;

  /** Art. 21(2) : au-delà de cette date, l'évaluation doit être refaite. */
  @Column({ type: 'timestamptz', nullable: true })
  evaluationExpireLe: Date | null;

  /**
   * Art. 8(2) : lien déclaré avec le prestataire. Le rôle back-office suffit à
   * identifier salariés et dirigeants ; cette déclaration couvre ce que le
   * système ne peut pas deviner — actionnaires et personnes liées par une
   * relation de contrôle.
   */
  @Column({ type: 'varchar', default: LienAvecPrestataire.AUCUN })
  lienAvecPrestataire: LienAvecPrestataire;

  /** Part du capital ou des droits de vote détenue, entre 0 et 1. */
  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  participationPrestataire: number | null;

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

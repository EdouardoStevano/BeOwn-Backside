import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ModeDeDetention } from 'src/onboarding/domain/enums/mode-de-detention.enum';
import { ProfilPMEntity } from './profil-pm.entity';

@Entity('beneficiaire_effectif')
export class BeneficiaireEffectifEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * La société dont cette personne est bénéficiaire.
   *
   * Portait le `utilisateurId` du titulaire, du temps où celui-ci tenait lieu
   * de clé au dossier moral. Un compte pouvant désormais en déclarer
   * plusieurs, l'ancienne valeur ne désignait plus une société mais un
   * ensemble : les bénéficiaires de toutes les sociétés d'un même dirigeant se
   * seraient confondus.
   */
  @Column({ type: 'uuid' })
  @Index()
  profilPMId: string;

  @ManyToOne(() => ProfilPMEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profilPMId' })
  profilPM: ProfilPMEntity;

  @Column({ type: 'varchar' })
  prenom: string;

  @Column({ type: 'varchar' })
  nom: string;

  @Column({ type: 'date', nullable: true })
  dateNaissance: Date | null;

  @Column({ type: 'varchar', nullable: true })
  nationalite: string | null;

  /** 25,00 à 100,00 — en deçà, la personne n'est pas bénéficiaire effectif. */
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  pourcentageDetention: number;

  /**
   * Détention directe ou indirecte — la distinction que fait le cahier des
   * charges, et que le modèle ignorait.
   *
   * Elle change une règle : seules les parts **directes** se partagent le
   * capital et sont donc plafonnées à 100 % au total. Les indirectes se
   * superposent (voir `RegistreDesBeneficiaires`).
   */
  @Column({ type: 'varchar', default: ModeDeDetention.DIRECTE })
  modeDetention: ModeDeDetention;

  // `pieceIdentiteDocId` a disparu. C'était un `varchar` nullable que le DTO
  // pouvait remplir sans qu'aucun code ne le lise ni ne vérifie qu'il désignait
  // un document existant. Le rattachement va désormais dans l'autre sens :
  // `piece_justificative.beneficiaireId` pointe vers cette ligne, et la pièce
  // porte son type, son statut d'instruction et son motif de refus — ce qu'une
  // clé étrangère nue ne pouvait pas dire.

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

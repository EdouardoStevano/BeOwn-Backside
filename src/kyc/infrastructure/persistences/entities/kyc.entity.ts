import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { KycNiveau, KycStatus } from 'src/kyc/domains/enums/kyc-status.enum';

@Entity('kyc')
export class KycEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Le titulaire du dossier, **par identité seule**.
   *
   * C'était la dernière relation de ce contexte vers `UserEntity`, et la seule
   * qui était réellement chargée : `findAll` la joignait pour que la liste
   * d'administration affiche un nom. Profiles dépendait donc de
   * l'infrastructure d'IAM pour un besoin d'affichage (§12.7).
   *
   * Le nom est désormais composé au-dessus, par le port `USER_REPOSITORY`
   * (`GetKycUseCase.executeAll`). La clé étrangère en base est inchangée.
   */
  @Column()
  @Index()
  utilisateurId: number;

  @Column({ type: 'varchar', default: KycStatus.NON_DEMARRE })
  statut: KycStatus;

  @Column({ type: 'varchar', default: KycNiveau.STANDARD })
  niveau: KycNiveau;

  @Column({ type: 'integer', nullable: true })
  scoreRisque: number | null;

  @Column({ type: 'varchar', default: 'stripe' })
  fournisseur: string;

  @Column({ type: 'varchar', nullable: true })
  fournisseurRef: string | null;

  @Column({ type: 'date', nullable: true })
  valideJusquAu: Date | null;

  @Column({ type: 'varchar', nullable: true })
  motifRefus: string | null;

  /** ID du rapport de vérification Stripe Identity (vs_report_xxx) */
  @Column({ type: 'varchar', nullable: true })
  stripeReportId: string | null;

  /** Données extraites du document par Stripe Identity */
  @Column({ type: 'jsonb', nullable: true })
  identiteExtrait: {
    nom?: string;
    prenom?: string;
    dateNaissance?: string;
    nationalite?: string;
    typeDocument?: string;
    numeroDocument?: string;
    dateExpiration?: string;
    /** Stripe file ID — recto document */
    documentFrontFileId?: string;
    /** Stripe file ID — verso document */
    documentBackFileId?: string;
    /** Stripe file ID — selfie */
    selfieFileId?: string;
  } | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

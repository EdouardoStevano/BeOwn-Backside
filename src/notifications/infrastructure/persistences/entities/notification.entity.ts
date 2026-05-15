import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';

export enum NotificationCanal {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  IN_APP = 'in_app',
}

export enum NotificationType {
  KYC_VALIDE = 'kyc_valide',
  KYC_REJETE = 'kyc_rejete',
  NOUVEAU_PROJET = 'nouveau_projet',
  ECHEANCE = 'echeance',
  DEPOT_CONFIRME = 'depot_confirme',
  RETRAIT_TRAITE = 'retrait_traite',
  MARCHE_SECONDAIRE = 'marche_secondaire',
  INVESTISSEMENT = 'investissement',
  AUTRE = 'autre',
  // ── New ──────────────────────────────────────────
  COMPTE_SUSPENDU = 'compte_suspendu',
  COMPTE_REACTIVE = 'compte_reactive',
  COMPTE_CLOS = 'compte_clos',
  COMPTE_SUPPRIME = 'compte_supprime',
  NOUVELLE_INSCRIPTION = 'nouvelle_inscription',
  PROFIL_MODIFIE = 'profil_modifie',
}

@Entity('notification')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', nullable: true })
  @Index()
  utilisateurId: number | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'utilisateur_id' })
  utilisateur: UserEntity;

  @Column({ type: 'varchar', nullable: true })
  canal: NotificationCanal | null;

  @Column({ type: 'varchar', nullable: true })
  type: NotificationType | null;

  @Column({ type: 'varchar', nullable: true })
  titre: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'boolean', default: false })
  lu: boolean;

  @Column({ type: 'varchar', nullable: true })
  templateCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  statut: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  envoyeLe: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

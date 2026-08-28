import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

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
  SECURITE = 'securite',
  INVESTISSEUR_INACTIF = 'investisseur_inactif',
  PROJET_CONSULTE_2X = 'projet_consulte_2x',
  KYC_REVUE_MANUELLE = 'kyc_revue_manuelle',
  /**
   * Une pièce du dossier personne morale a été refusée à l'instruction.
   *
   * Distincte de `KYC_REJETE` : celle-ci vise **une pièce** que le titulaire
   * peut remplacer seul, pas le dossier d'identité entier. Les confondre ferait
   * lire « votre KYC a été refusé » à qui doit simplement redéposer un KBIS
   * périmé.
   */
  PIECE_JUSTIFICATIVE_REFUSEE = 'piece_justificative_refusee',
  /**
   * Le dossier KYB d'une société a été tranché par l'équipe conformité.
   *
   * Distinctes de `KYC_VALIDE` / `KYC_REJETE`, qui visent l'identité d'une
   * **personne** : une société n'a pas d'identité à vérifier, elle a un dossier
   * de justificatifs. Les confondre ferait lire « votre vérification d'identité
   * a été refusée » au dirigeant dont le KYC personnel est validé depuis des
   * mois.
   *
   * Distinctes aussi de `PIECE_JUSTIFICATIVE_REFUSEE`, qui ne dit qu'une pièce :
   * un dossier dont tous les documents sont acceptés peut être rejeté pour
   * incohérence entre eux, et aucun refus de pièce ne l'aurait annoncé.
   */
  KYB_VALIDE = 'kyb_valide',
  KYB_REFUSE = 'kyb_refuse',
}

@Entity('notification')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Le destinataire, **par identité seule** — `null` pour une notification
   * d'audience (diffusion). La relation vers `UserEntity` n'était chargée nulle
   * part et faisait dépendre Notifications de l'infrastructure d'IAM (§12.7).
   * La clé étrangère en base ne bouge pas.
   */
  @Column({ type: 'integer', nullable: true })
  @Index()
  utilisateurId: number | null;

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

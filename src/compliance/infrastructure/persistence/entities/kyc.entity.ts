import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  KycNiveau,
  KycStatus,
} from 'src/compliance/domain/enums/kyc-status.enum';

@Entity('kyc')
export class KycEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Le dossier de conformité auquel cette pièce appartient — relation 1:1.
   *
   * C'était `utilisateurId`, une colonne vers `users` : la pièce se rattachait
   * au compte par-dessus sa racine. Elle ne connaît plus que celle-ci, qui est
   * la seule à savoir de quel titulaire il s'agit (§6). `unique` porte le 1:1 :
   * un dossier de conformité n'a qu'un dossier de vérification.
   */
  @Column({ type: 'uuid' })
  @Index({ unique: true })
  profileId: string;

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

  /**
   * Le document que le titulaire a déposé lui-même pour la revue manuelle.
   *
   * `jsonb` et non douze colonnes à plat, contrairement aux justificatifs de
   * société : rien ici ne se filtre ni ne se trie — on lit ce document pour
   * l'instruire, jamais pour chercher parmi d'autres. La colonne
   * `identiteExtrait` juste au-dessus fait déjà ce choix, pour la même raison.
   *
   * Distinct d'elle, malgré la proximité : `identiteExtrait` est ce que **le
   * fournisseur** a lu sur la pièce qu'il a capturée, celle-ci est ce que le
   * **titulaire** donne à lire à l'humain quand le fournisseur n'a pas conclu.
   */
  @Column({ type: 'jsonb', nullable: true })
  pieceIdentiteDeposee: {
    type: string;
    recto: {
      nomOrigine: string;
      cleStockage: string;
      url: string;
      mimeType: string;
      tailleOctets: number;
    };
    verso: {
      nomOrigine: string;
      cleStockage: string;
      url: string;
      mimeType: string;
      tailleOctets: number;
    } | null;
    deposeeLe: string;
  } | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

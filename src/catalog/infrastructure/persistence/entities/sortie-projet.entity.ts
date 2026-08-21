import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutSortie } from 'src/catalog/domain/enums/statut-sortie.enum';

@Entity('sortie_projet')
export class SortieProjetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  projetId: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  prixRevente: number;

  @Column({ type: 'date' })
  dateRevente: Date;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  plusValueBrute: number;

  @Column({ type: 'varchar', default: StatutSortie.PROJETEE })
  statut: StatutSortie;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  acteVentePdfUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

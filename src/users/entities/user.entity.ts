import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// export enum InvestorCategory {
//   AVERTI = 'averti',
//   NON_AVERTI = 'non_averti',
// }
//
// export enum KycStatus {
//   PENDING = 'pending',
//   VALIDATED = 'validated',
//   REJECTED = 'rejected',
// }
//
// export interface QuestionnaireAnswer {
//   question: string;
//   response: string;
// }
//

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ default: false })
  isEmailVerify: boolean;

  @Column({ nullable: true })
  firstname: string;

  @Column({ nullable: true })
  lastname: string;

  // @Column({ nullable: true })
  // picture: string;
  //
  // @Column({ type: 'date', nullable: true })
  // dateOfBirth: Date;
  //
  // @Column({ nullable: true })
  // address: string;
  //
  // @Column({ nullable: true, unique: true })
  // phone: string;
  //
  // @Column({ nullable: true })
  // nationality: string;
  //
  // @Column({ nullable: true })
  // taxResidence: string;
  //
  // @Column({ nullable: true })
  // iban: string;
  //
  // @Column({ type: 'enum', enum: KycStatus, default: KycStatus.PENDING })
  // kycStatus: KycStatus;
  //
  // @Column({
  //   type: 'enum',
  //   enum: InvestorCategory,
  //   default: InvestorCategory.AVERTI,
  // })
  // investorCategory: InvestorCategory;
  //
  // @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  // netWorth: number;
  //
  // @Column({ type: 'jsonb', nullable: true })
  // questionnaireAnswers: QuestionnaireAnswer[];
  //
  // @CreateDateColumn()
  // createdAt: Date;
  //
  // @UpdateDateColumn()
  // updatedAt: Date;
  //
  // @Column({ default: 'regular' })
  // role: string;

  @Column({ nullable: true })
  @Index()
  socialId: string;

  @Column({ nullable: true })
  password: string;

  @Column({ default: false })
  isTfaEnabled: boolean;

  @Column({ nullable: true })
  tfaSecret: string;
}

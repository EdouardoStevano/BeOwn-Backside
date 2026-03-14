import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Index(['email', 'socialId'])
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

  @Column({ nullable: true })
  picture: string;

  @Column({ nullable: true })
  socialId: string;

  @Column({ nullable: true })
  password: string;

  @Column({ default: false })
  isTfaEnabled: boolean;

  @Column({ nullable: true })
  tfaSecret: string;
}

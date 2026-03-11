import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  firstname: string;

  @Column({ nullable: true })
  lastname: string;

  @Column({ nullable: true })
  picture: string;

  @Column({ nullable: true })
  socialId: string;

  @Column({ nullable: true })
  password: string;
}

import { ChildEntity, Column } from 'typeorm';
import { TFAMethodEntity } from './tfa-method.entity';

@ChildEntity('email_methods')
export class EmailMethodEntity extends TFAMethodEntity {
  @Column({ unique: true })
  emailOTP: string;
}

import { ChildEntity, Column } from 'typeorm';
import { TFAMethodEntity } from './tfa-method.entity';

@ChildEntity('sms_methods')
export class SMSMethodEntity extends TFAMethodEntity {
  @Column()
  phoneNumberOTP: string;
}

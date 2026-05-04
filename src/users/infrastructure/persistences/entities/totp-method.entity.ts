import { ChildEntity, Column } from 'typeorm';
import { TFAMethodEntity } from './tfa-method.entity';

@ChildEntity('totp_methods')
export class TOTPMethodEntity extends TFAMethodEntity {
  @Column({ select: false })
  secretKeyOtp: string;
}

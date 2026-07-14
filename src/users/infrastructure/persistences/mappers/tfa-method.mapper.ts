import {
  EmailMethod,
  SmsMethod,
  TfaMethod,
  TotpMethod,
} from 'src/users/domains/tfa-method';
import { TwoFactorMethod } from 'src/users/domains/enums/user.enum';
import { TFAMethodEntity } from '../entities/tfa-method.entity';
import { EmailMethodEntity } from '../entities/email-method.entity';
import { SMSMethodEntity } from '../entities/sms-method.entity';
import { TOTPMethodEntity } from '../entities/totp-method.entity';

/**
 * Traduction entre l'héritage de table unique de TypeORM (discriminant
 * `type_method`) et les sous-classes du domaine.
 */
export class TfaMapper {
  static toDomain(entity: TFAMethodEntity): TfaMethod {
    const domain = TfaMapper.instantiate(entity);
    domain.tfaMethodId = entity.TFAMethodId;
    domain.isActive = entity.isActive;
    domain.activatedDate = entity.activatedDate;
    return domain;
  }

  /** Le canal porté par une ligne, lu depuis sa sous-classe TypeORM. */
  static methodOf(entity: TFAMethodEntity): TwoFactorMethod {
    if (entity instanceof EmailMethodEntity) return TwoFactorMethod.EMAIL;
    if (entity instanceof SMSMethodEntity) return TwoFactorMethod.SMS;
    return TwoFactorMethod.TOTP;
  }

  /** `restore` et non `create` : on ne rejoue pas les règles sur une ligne déjà persistée. */
  private static instantiate(entity: TFAMethodEntity): TfaMethod {
    if (entity instanceof EmailMethodEntity) {
      return EmailMethod.restore(entity.emailOTP);
    }

    if (entity instanceof SMSMethodEntity) {
      return SmsMethod.restore(entity.phoneNumberOTP);
    }

    return TotpMethod.restore((entity as TOTPMethodEntity).secretKeyOtp);
  }
}

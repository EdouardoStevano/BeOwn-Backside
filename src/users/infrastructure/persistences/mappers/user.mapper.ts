import { User } from 'src/users/domains/user';
import { UserEntity } from '../entities/user.entity';
import { UserEmail } from 'src/users/domains/value-objects/user-email.vo';
import { TFAMethodEntity } from '../entities/tfa-method.entity';
import {
  EmailMethod,
  SmsMethod,
  TfaMethod,
  TotpMethod,
} from 'src/users/domains/tfa-method';
import { EmailMethodEntity } from '../entities/email-method.entity';
import { SMSMethodEntity } from '../entities/sms-method.entity';
import { TOTPMethodEntity } from '../entities/totp-method.entity';
import { UserEmailEntity } from '../entities/user-email.entity';

export class UserMapper {
  static toDomain(entity: UserEntity): User {
    const user = new User();
    user.userId = entity.userId;
    user.firstname = entity.firstname;
    user.lastname = entity.lastname;
    user.socialId = entity.socialId;
    user.password = entity.password;
    user.role = entity.role;
    user.status = entity.status;
    user.userType = entity.userType;
    user.regimeFiscal = entity.regimeFiscal;
    user.cguAccepteesLe = entity.cguAccepteesLe;
    user.lastLoginAt = entity.lastLoginAt;
    user.createdAt = entity.createdAt;
    user.updatedAt = entity.updatedAt;

    if (entity.userEmail) {
      user.userEmail = UserEmail.restore(
        entity.userEmail.email,
        entity.userEmail.isVerified,
        entity.userEmail.verifiedDate,
      );
    }

    if (entity.tfaMethods) {
      user.tfaMethods = entity.tfaMethods.map(UserMapper.tfaToDomain);
    }

    return user;
  }

  static toEntity(domain: User): UserEntity {
    const entity = new UserEntity();
    if (domain.userId) entity.userId = domain.userId;
    entity.firstname = domain.firstname;
    entity.lastname = domain.lastname;
    entity.socialId = domain.socialId;

    // `undefined` est volontaire, pas une omission : TypeORM ignore les colonnes
    // undefined lors d'un save(). C'est ce qui évite d'écraser le hash du mot de
    // passe quand l'agrégat a été chargé sans lui (colonne `select: false`), ou
    // d'écraser un défaut SQL sur un utilisateur qui vient d'être créé.
    entity.password = domain.password;
    entity.role = domain.role;
    entity.status = domain.status;
    entity.userType = domain.userType;
    entity.regimeFiscal = domain.regimeFiscal;
    entity.cguAccepteesLe = domain.cguAccepteesLe;
    entity.lastLoginAt = domain.lastLoginAt;

    if (domain.userEmail) {
      const emailEntity = new UserEmailEntity();
      emailEntity.email = domain.userEmail.email;
      emailEntity.isVerified = domain.userEmail.isVerified;
      emailEntity.verifiedDate = domain.userEmail.verifiedDate;
      emailEntity.user = entity;

      if (domain.userId) {
        emailEntity.userId = domain.userId;
      }
      entity.userEmail = emailEntity;
    }

    return entity;
  }

  private static tfaToDomain(this: void, entity: TFAMethodEntity): TfaMethod {
    if (entity instanceof EmailMethodEntity) {
      const emailMethod = new EmailMethod();
      emailMethod.emailOtp = entity.emailOTP;
      emailMethod.isActive = entity.isActive;
      emailMethod.tfaMethodId = entity.TFAMethodId;
      emailMethod.activatedDate = entity.activatedDate;
      return emailMethod;
    }

    if (entity instanceof SMSMethodEntity) {
      const smsMethod = new SmsMethod();
      smsMethod.tfaMethodId = entity.TFAMethodId;
      smsMethod.isActive = entity.isActive;
      smsMethod.activatedDate = entity.activatedDate;
      smsMethod.phoneNumberOtp = entity.phoneNumberOTP;
      return smsMethod;
    }

    const totpMethodEntity = entity as TOTPMethodEntity;
    const totpMethod = new TotpMethod();
    totpMethod.tfaMethodId = totpMethodEntity.TFAMethodId;
    totpMethod.isActive = totpMethodEntity.isActive;
    totpMethod.activatedDate = totpMethodEntity.activatedDate;
    totpMethod.secretKeyOtp = totpMethodEntity.secretKeyOtp;
    return totpMethod;
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PreferencesRepository } from 'src/preferences/domains/ports/preferences.repository';
import { Preferences } from 'src/preferences/domains/preferences';
import { UserPreferencesEntity } from '../entities/user-preferences.entity';

@Injectable()
export class PreferencesTypeOrmRepository implements PreferencesRepository {
  constructor(
    @InjectRepository(UserPreferencesEntity)
    private readonly preferencesRepo: Repository<UserPreferencesEntity>,
  ) {}

  /**
   * Une ligne absente n'est pas une anomalie : elle signifie « réglages par
   * défaut ». Le port rend donc toujours un objet, et l'appelant n'a pas à
   * distinguer les deux cas — c'était déjà le comportement de
   * `UserRepository.findPreferences`, mais il le reconstruisait à la main.
   */
  async findByUserId(userId: number): Promise<Preferences> {
    const entity = await this.preferencesRepo.findOne({
      where: { userId },
    });
    return entity ? toDomain(entity) : Preferences.defaut(userId);
  }

  async save(preferences: Preferences): Promise<Preferences> {
    const saved = await this.preferencesRepo.save(toEntity(preferences));
    return toDomain(saved);
  }
}

function toDomain(entity: UserPreferencesEntity): Preferences {
  return new Preferences({
    utilisateurId: entity.userId,
    langue: entity.langue,
    masquerMontants: entity.masquerMontants,
    notifEmail: entity.notifEmail,
    notifSms: entity.notifSms,
    notifMarketing: entity.notifMarketing,
    twoFactorEnabled: entity.twoFactorEnabled,
    preferredCurrency: entity.preferredCurrency,
  });
}

/**
 * `twoFactorEnabled` est recopié tel qu'il a été lu : l'agrégat le porte en
 * lecture seule, et cette colonne n'a plus d'écrivain — voir
 * `MfaNonModifiableParPreferenceError`.
 */
function toEntity(domain: Preferences): UserPreferencesEntity {
  const entity = new UserPreferencesEntity();
  entity.userId = domain.utilisateurId;
  entity.langue = domain.langue;
  entity.masquerMontants = domain.masquerMontants;
  entity.notifEmail = domain.notifEmail;
  entity.notifSms = domain.notifSms;
  entity.notifMarketing = domain.notifMarketing;
  entity.twoFactorEnabled = domain.twoFactorEnabled;
  entity.preferredCurrency = domain.preferredCurrency;
  return entity;
}

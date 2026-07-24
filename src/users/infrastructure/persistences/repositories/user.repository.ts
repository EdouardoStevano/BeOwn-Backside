import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserRepository } from 'src/users/applications/ports/repositories/user.repository';
import { UserEntity } from '../entities/user.entity';
import { UserPreferencesEntity } from '../entities/user-preferences.entity';
import { Repository } from 'typeorm';
import { User } from 'src/users/domains/user';
import { UserPreferences } from 'src/users/domains/user-preferences';
import { UserMapper } from '../mappers/user.mapper';
import { EmailAlreadyInUseError } from 'src/users/domains/errors/user.errors';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class UserTypeOrmRepository implements UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(UserPreferencesEntity)
    private readonly prefsRepository: Repository<UserPreferencesEntity>,
  ) {}

  async save(user: User): Promise<User> {
    const entity = UserMapper.toEntity(user);

    let saved: UserEntity;
    try {
      saved = await this.usersRepository.save(entity);
    } catch (err) {
      // La contrainte d'unicité est une règle métier ; c'est ici, dans
      // l'adapter, qu'on traduit le code d'erreur PostgreSQL en erreur de
      // domaine. Au-dessus, plus personne ne sait qu'il y a un SGBD.
      if ((err as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
        throw new EmailAlreadyInUseError();
      }
      throw err;
    }

    // Reload with relations — TypeORM save() does not auto-populate them
    const reloaded = await this.usersRepository.findOne({
      where: { userId: saved.userId },
      relations: ['userEmail', 'tfaMethods'],
    });
    return UserMapper.toDomain(reloaded ?? saved);
  }

  async findById(userId: number): Promise<User | null> {
    const entity = await this.usersRepository.findOne({
      where: { userId },
      relations: ['userEmail', 'tfaMethods'],
    });

    return entity ? UserMapper.toDomain(entity) : null;
  }

  async findByIdWithPassword(userId: number): Promise<User | null> {
    // Colonne `password` en `select: false` : on la charge explicitement,
    // uniquement pour la vérification du mot de passe (suppression
    // self-service). findById reste sans le hash pour ne pas le faire fuiter.
    const entity = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userEmail', 'userEmail')
      .leftJoinAndSelect('user.tfaMethods', 'tfaMethods')
      .addSelect('user.password')
      .where('user.userId = :userId', { userId })
      .getOne();

    return entity ? UserMapper.toDomain(entity) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const entity = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userEmail', 'userEmail')
      .leftJoinAndSelect('user.tfaMethods', 'tfaMethods')
      .addSelect('user.password')
      .where('userEmail.email = :email', { email: email.toLowerCase() })
      .getOne();

    return entity ? UserMapper.toDomain(entity) : null;
  }

  async update(user: User): Promise<User> {
    const entity = UserMapper.toEntity(user);

    const updated = await this.usersRepository.save(entity);
    return UserMapper.toDomain(updated);
  }

  async findOneBySocialId(socialId: string): Promise<User | null> {
    const userEntity = await this.usersRepository.findOne({
      where: { socialId },
      relations: ['userEmail', 'tfaMethods'],
    });
    return userEntity ? UserMapper.toDomain(userEntity) : null;
  }

  async findPreferences(userId: number): Promise<UserPreferences> {
    let entity = await this.prefsRepository.findOne({ where: { userId } });
    if (!entity) {
      entity = this.prefsRepository.create({ userId });
      entity = await this.prefsRepository.save(entity);
    }
    return this.prefsToDomaim(entity);
  }

  async savePreferences(
    userId: number,
    prefs: Partial<UserPreferences>,
  ): Promise<UserPreferences> {
    let entity = await this.prefsRepository.findOne({ where: { userId } });
    if (!entity) {
      entity = this.prefsRepository.create({ userId });
    }
    Object.assign(entity, prefs);
    const saved = await this.prefsRepository.save(entity);
    return this.prefsToDomaim(saved);
  }

  private prefsToDomaim(e: UserPreferencesEntity): UserPreferences {
    const p = new UserPreferences();
    p.userId = e.userId;
    p.langue = e.langue;
    p.masquerMontants = e.masquerMontants;
    p.notifEmail = e.notifEmail;
    p.notifSms = e.notifSms;
    p.notifMarketing = e.notifMarketing;
    p.twoFactorMethod = e.twoFactorMethod;
    p.preferredCurrency = e.preferredCurrency;
    p.createdAt = e.createdAt;
    p.updatedAt = e.updatedAt;
    return p;
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserRepository } from 'src/iam/domains/ports/user.repository';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { In, Repository } from 'typeorm';
import { User } from 'src/iam/domains/models/user';
import { UserMapper } from 'src/iam/infrastructure/persistence/mappers/user.mapper';

@Injectable()
export class UserTypeOrmRepository implements UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async save(user: User): Promise<User> {
    const entity = UserMapper.toEntity(user);
    const saved = await this.usersRepository.save(entity);
    // Reload with relations — TypeORM save() does not auto-populate them
    const reloaded = await this.usersRepository.findOne({
      where: { userId: saved.userId },
      relations: ['userEmail'],
    });
    return UserMapper.toDomain(reloaded ?? saved);
  }

  async findById(userId: number): Promise<User | null> {
    const entity = await this.usersRepository.findOne({
      where: { userId },
      relations: ['userEmail'],
    });

    return entity ? UserMapper.toDomain(entity) : null;
  }

  async findManyByIds(userIds: number[]): Promise<User[]> {
    // `In([])` produit un `IN ()` que Postgres rejette : on court-circuite.
    if (userIds.length === 0) return [];

    const entities = await this.usersRepository.find({
      where: { userId: In([...new Set(userIds)]) },
      relations: ['userEmail'],
    });

    return entities.map((entity) => UserMapper.toDomain(entity));
  }

  async findByIdWithPassword(userId: number): Promise<User | null> {
    // Colonne `password` en `select: false` : on la charge explicitement,
    // uniquement pour la vérification du mot de passe (suppression
    // self-service). findById reste sans le hash pour ne pas le faire fuiter.
    const entity = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userEmail', 'userEmail')
      .addSelect('user.password')
      .where('user.userId = :userId', { userId })
      .getOne();

    return entity ? UserMapper.toDomain(entity) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const entity = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userEmail', 'userEmail')
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
      relations: ['userEmail'],
    });
    return userEntity ? UserMapper.toDomain(userEntity) : null;
  }
}

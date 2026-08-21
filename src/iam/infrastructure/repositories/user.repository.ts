import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserRepository } from 'src/iam/domain/repositories/user.repository';
import { MfaMethodEntity } from 'src/iam/infrastructure/persistence/entities/mfa-method.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { In, Repository } from 'typeorm';
import { User } from 'src/iam/domain/aggregates/user';
import { MfaMethod } from 'src/iam/domain/entities/mfa-method';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { UserMapper } from 'src/iam/infrastructure/persistence/mappers/user.mapper';

@Injectable()
export class UserTypeOrmRepository implements UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    /**
     * Les facteurs MFA sont des entités de l'agrégat `User` : ils n'ont plus de
     * repository à eux. C'est donc ici, avec la racine, qu'ils se chargent et
     * se sauvegardent — la table reste distincte, l'agrégat ne l'est pas.
     */
    @InjectRepository(MfaMethodEntity)
    private readonly facteursRepository: Repository<MfaMethodEntity>,
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

  /**
   * Le compte **avec ses facteurs**. Deux requêtes plutôt qu'une jointure : la
   * relation reste unidirectionnelle côté ORM — un `@OneToMany` sur
   * `UserEntity` ramènerait ces lignes à chaque lecture de compte, secrets
   * compris, pour les rares parcours qui en ont besoin.
   */
  async findByIdWithFacteurs(userId: number): Promise<User | null> {
    const [entity, facteurs] = await Promise.all([
      this.usersRepository.findOne({
        where: { userId },
        relations: ['userEmail'],
      }),
      this.chargerFacteurs(userId),
    ]);

    return entity ? UserMapper.toDomain(entity, facteurs) : null;
  }

  /**
   * `credential` est en `select: false` sur l'entité — il faut le réintroduire
   * explicitement, d'où le query builder plutôt qu'un `find`.
   */
  private async chargerFacteurs(userId: number): Promise<MfaMethod[]> {
    const entities = await this.facteursRepository
      .createQueryBuilder('mfa')
      .addSelect('mfa.credential')
      .where('mfa.user_id = :userId', { userId })
      .orderBy('mfa.id', 'DESC')
      .getMany();

    // `rehydrate` et non un objet nu : c'est l'entité de domaine qui décide
    // ensuite ce que son `credential` accepte de rendre, et sous quelle forme.
    return entities.map((entity) =>
      MfaMethod.rehydrate({
        id: entity.id,
        method: entity.method,
        isActive: entity.isActive,
        credential: entity.credential,
      }),
    );
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

  async findCgpByCodeParrainage(code: string): Promise<User | null> {
    const entity = await this.usersRepository.findOne({
      where: { cgpReferralCode: code, role: UserRole.CGP },
      relations: ['userEmail'],
    });

    return entity ? UserMapper.toDomain(entity) : null;
  }

  async findClientsDuCgp(cgpId: number): Promise<User[]> {
    const entities = await this.usersRepository.find({
      where: { cgpId },
      relations: ['userEmail'],
    });

    return entities.map((entity) => UserMapper.toDomain(entity));
  }

  /**
   * Enregistre le compte, **et ses facteurs s'ils ont été chargés**.
   *
   * La condition n'est pas une optimisation : un compte lu sans ses facteurs
   * ne sait pas ce qu'il possède, et écrire dans ce cas reviendrait à effacer
   * le facteur en place à chaque renommage. `User` refuse de les exposer dans
   * cet état, ce qui rend la distinction impossible à confondre ici.
   */
  async update(user: User): Promise<User> {
    const entity = UserMapper.toEntity(user);

    const updated = await this.usersRepository.save(entity);
    if (user.facteursCharges) {
      await this.enregistrerFacteurs(updated.userId, user.facteurs);
    }

    return UserMapper.toDomain(
      updated,
      user.facteursCharges ? [...user.facteurs] : undefined,
    );
  }

  /**
   * Réconcilie la collection de l'agrégat avec la table.
   *
   * Trois cas, dans cet ordre : ce que l'agrégat ne porte plus est supprimé,
   * ce qu'il a ajouté est inséré, ce qu'il a modifié est mis à jour. La
   * suppression passe **avant** l'insertion et la désactivation avant
   * l'activation, sans quoi l'index unique « au plus un facteur actif par
   * compte » refuserait l'écriture le temps d'une transition.
   */
  private async enregistrerFacteurs(
    userId: number,
    facteurs: readonly MfaMethod[],
  ): Promise<void> {
    const conserves = facteurs
      .map((facteur) => facteur.id)
      .filter((id): id is number => id !== null);

    const supprimables = await this.facteursRepository.find({
      where: { user: { userId } },
      select: ['id'],
    });
    const aSupprimer = supprimables
      .map((entity) => entity.id)
      .filter((id) => !conserves.includes(id));
    if (aSupprimer.length > 0) {
      await this.facteursRepository.delete({ id: In(aSupprimer) });
    }

    // Désactivations d'abord : elles libèrent l'index partiel unique.
    for (const facteur of facteurs) {
      if (facteur.id !== null && !facteur.isActive()) {
        await this.facteursRepository.update(facteur.id, { isActive: false });
      }
    }
    for (const facteur of facteurs) {
      if (facteur.id !== null && facteur.isActive()) {
        await this.facteursRepository.update(facteur.id, { isActive: true });
      }
    }

    const nouveaux = facteurs.filter((facteur) => facteur.id === null);
    for (const facteur of nouveaux) {
      const snapshot = facteur.toSnapshot();
      await this.facteursRepository.save(
        this.facteursRepository.create({
          method: snapshot.method,
          credential: snapshot.credential,
          isActive: snapshot.isActive,
          user: { userId } as UserEntity,
        }),
      );
    }
  }

  async findOneBySocialId(socialId: string): Promise<User | null> {
    const userEntity = await this.usersRepository.findOne({
      where: { socialId },
      relations: ['userEmail'],
    });
    return userEntity ? UserMapper.toDomain(userEntity) : null;
  }
}

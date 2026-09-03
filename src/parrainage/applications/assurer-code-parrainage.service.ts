import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { asUniqueViolation } from 'src/common/persistence/unique-violation';
import { genererCodeParrainage } from 'src/parrainage/domains/code-parrainage';

/**
 * Garantit qu'un compte possède SON code de parrainage, en le générant à la
 * demande.
 *
 * Deux appelants : le handler d'inscription (chaque nouveau compte naît avec
 * un code) et `GET /parrainage/me` (filet pour les comptes créés avant la
 * feature ou dont l'événement d'inscription s'est perdu — l'EventBus est en
 * mémoire, un crash entre la sauvegarde du compte et la réaction du handler
 * laisse un compte sans code). Le stock existant est couvert par le backfill
 * SQL (cf. rapport / ADR), ce service reste le filet du dernier recours.
 *
 * COLLISIONS. Le code est aléatoire et la colonne UNIQUE : plutôt que de
 * vérifier l'unicité par lecture (course entre deux réplicas), on écrit et on
 * laisse la contrainte trancher — violation 23505 → nouveau tirage. La
 * probabilité de collision est infime (31^6 combinaisons), la boucle est
 * bornée par principe.
 */
@Injectable()
export class AssurerCodeParrainageService {
  private readonly logger = new Logger(AssurerCodeParrainageService.name);
  private static readonly MAX_TENTATIVES = 5;

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  /** @returns le code du compte (existant ou fraîchement généré). */
  async assurer(userId: number): Promise<string> {
    const user = await this.usersRepo.findOne({
      where: { userId },
      select: ['userId', 'codeParrainage'],
    });
    if (!user) {
      throw new Error(`Compte ${userId} introuvable — aucun code à générer.`);
    }
    if (user.codeParrainage) return user.codeParrainage;

    for (let tentative = 1; ; tentative++) {
      const code = genererCodeParrainage();
      try {
        // UPDATE conditionnel (`codeParrainage IS NULL`) : si un autre
        // processus a posé un code entre la lecture et l'écriture, on ne
        // l'écrase pas — un code déjà communiqué à un filleul doit rester
        // stable.
        const res = await this.usersRepo
          .createQueryBuilder()
          .update(UserEntity)
          .set({ codeParrainage: code })
          .where('userId = :userId AND "codeParrainage" IS NULL', { userId })
          .execute();
        if (!res.affected) {
          // Course perdue : relire le code posé par l'autre processus.
          const relu = await this.usersRepo.findOne({
            where: { userId },
            select: ['codeParrainage'],
          });
          if (relu?.codeParrainage) return relu.codeParrainage;
          throw new Error(
            `Compte ${userId} : pose du code refusée sans code existant.`,
          );
        }
        return code;
      } catch (err) {
        if (
          asUniqueViolation(err) &&
          tentative < AssurerCodeParrainageService.MAX_TENTATIVES
        ) {
          // Collision de code avec un autre compte : nouveau tirage.
          this.logger.warn(
            `Collision de code parrainage (tentative ${tentative}) — nouveau tirage.`,
          );
          continue;
        }
        throw err;
      }
    }
  }
}

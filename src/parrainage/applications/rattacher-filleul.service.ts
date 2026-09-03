import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import {
  estFormatCodeParrainage,
  normaliserCodeParrainage,
} from '../domains/code-parrainage';

/**
 * Rattache un nouvel inscrit à son parrain à partir du code saisi.
 *
 * TOUT échec est un NON-ÉVÉNEMENT : code vide, mal formé, inconnu,
 * auto-parrainage — on journalise et on sort. La règle vient du produit :
 * une inscription ne doit JAMAIS échouer ni ralentir à cause d'un code de
 * parrainage (le filet du filleul, c'est de perdre son bonus, pas son
 * compte).
 *
 * Le lien est posé par UPDATE CONDITIONNEL (`parrainePar IS NULL`) : figé à
 * la première pose, jamais réécrit — un fait d'acquisition ne se renégocie
 * pas, et un rejeu de l'événement d'inscription est ainsi sans effet.
 */
@Injectable()
export class RattacherFilleulService {
  private readonly logger = new Logger(RattacherFilleulService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async rattacher(filleulId: number, codeBrut: string | null): Promise<void> {
    if (!codeBrut?.trim()) return;

    const code = normaliserCodeParrainage(codeBrut);
    if (!estFormatCodeParrainage(code)) {
      this.logger.log(
        `Code de parrainage mal formé ignoré à l'inscription du compte ${filleulId}.`,
      );
      return;
    }

    const parrain = await this.users.findOne({
      where: { codeParrainage: code },
      select: ['userId'],
    });
    if (!parrain) {
      this.logger.log(
        `Code de parrainage inconnu (${code}) ignoré à l'inscription du compte ${filleulId}.`,
      );
      return;
    }
    if (parrain.userId === filleulId) {
      // Impossible par construction (le compte vient de naître, sans code),
      // mais la ceinture est gratuite et le chemin crédite de l'argent.
      this.logger.warn(`Auto-parrainage refusé pour le compte ${filleulId}.`);
      return;
    }

    const res = await this.users
      .createQueryBuilder()
      .update(UserEntity)
      .set({ parrainePar: parrain.userId })
      .where('userId = :filleulId AND "parrainePar" IS NULL', { filleulId })
      .execute();

    if (res.affected) {
      this.logger.log(
        `Compte ${filleulId} rattaché au parrain ${parrain.userId} (code ${code}).`,
      );
    }
  }
}

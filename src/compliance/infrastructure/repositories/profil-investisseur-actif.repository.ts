import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfilInvestisseurActifRepository } from 'src/compliance/domain/repositories/profil-investisseur-actif.repository';
import { ProfilInvestisseur } from 'src/compliance/domain/value-objects/profil-investisseur.vo';
import { ProfilInvestisseurActifEntity } from '../persistence/entities/profil-investisseur-actif.entity';

/**
 * Le profil actif d'un compte, tenu par une ligne au plus.
 *
 * `lire` rend **toujours** un profil : pas de ligne, ou une ligne sans société,
 * signifient l'un comme l'autre « en son nom propre ». C'est le repli
 * protecteur — agir pour soi n'engage que soi — et le traduire ici plutôt que
 * chez chaque appelant évite qu'un `null` oublié fasse agir quelqu'un au nom
 * d'une personne morale.
 */
@Injectable()
export class ProfilInvestisseurActifTypeOrmRepository implements ProfilInvestisseurActifRepository {
  constructor(
    @InjectRepository(ProfilInvestisseurActifEntity)
    private readonly choix: Repository<ProfilInvestisseurActifEntity>,
  ) {}

  async lire(userId: number): Promise<ProfilInvestisseur> {
    const ligne = await this.choix.findOne({ where: { userId } });
    return ProfilInvestisseur.restore(ligne?.societeId ?? null);
  }

  /**
   * `save` sur une clé primaire connue : TypeORM insère ou met à jour selon que
   * la ligne existe, ce qui est exactement la sémantique voulue — un compte
   * n'accumule pas ses bascules, il n'en garde que la dernière.
   */
  async basculer(userId: number, profil: ProfilInvestisseur): Promise<void> {
    await this.choix.save({ userId, societeId: profil.societeId });
  }
}

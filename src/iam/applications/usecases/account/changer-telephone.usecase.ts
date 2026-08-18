import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';

/**
 * Enregistre le numéro de rappel d'un compte.
 *
 * **Le contexte propriétaire garde sa règle.** Le numéro est déclaré ailleurs
 * — le formulaire de complétion du profil investisseur — mais il appartient au
 * compte, et savoir *comment* on l'écrit (l'éprouver, ne rien faire s'il n'a
 * pas bougé) est l'affaire d'IAM. Les abonnés du contexte Profiles disent
 * *quand*, ce use case dit *comment* : chacun garde ce qui lui revient sans que
 * la dépendance ne s'inverse.
 *
 * Sans effet quand le compte a disparu entre la déclaration et le report : le
 * numéro n'a plus de titulaire à joindre.
 *
 * @returns `true` si le compte a été écrit.
 */
@Injectable()
export class ChangerTelephoneUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(userId: number, telephone: string | null): Promise<boolean> {
    const compte = await this.userRepository.findById(userId);
    if (!compte) return false;

    // `changerTelephone` éprouve le numéro et dit s'il a bougé : redéclarer le
    // même n'écrit pas, et un numéro invalide lève ici plutôt qu'en base.
    if (!compte.changerTelephone(telephone)) return false;

    await this.userRepository.update(compte);
    return true;
  }
}

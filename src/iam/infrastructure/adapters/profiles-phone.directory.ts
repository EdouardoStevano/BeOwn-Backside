import { Inject, Injectable } from '@nestjs/common';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from 'src/profiles/applications/ports/repositories/profil.repository';
import { PhoneDirectory } from 'src/iam/domain/ports/phone.directory';

/**
 * Couche anti-corruption vers le contexte Profiles : le numéro de téléphone
 * d'un compte est saisi dans son profil personne physique.
 *
 * Le contexte Profiles ne publie pas encore de contrat applicatif (à la
 * différence de Users et son USER_ACCOUNT_SERVICE) : cet adapter parle donc
 * directement à son port de repository. C'est le seul fichier d'IAM qui le
 * fait, et le seul à retoucher le jour où Profiles publiera son contrat.
 */
@Injectable()
export class ProfilesPhoneDirectory implements PhoneDirectory {
  constructor(
    @Inject(PROFIL_REPOSITORY)
    private readonly profils: ProfilRepository,
  ) {}

  async findPhone(accountId: number): Promise<string | null> {
    const profil = await this.profils.findProfilPPByUserId(accountId);
    return profil?.telephone ?? null;
  }
}

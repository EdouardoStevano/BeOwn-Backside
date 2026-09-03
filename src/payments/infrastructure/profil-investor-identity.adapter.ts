import { Inject, Injectable } from '@nestjs/common';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from 'src/profiles/applications/ports/repositories/profil.repository';
import {
  InvestorIdentityReader,
  type InvestorIdentity,
} from '../applications/ports/investor-identity.port';

/**
 * Branche `InvestorIdentityReader` sur le profil personne physique déjà
 * collecté par le parcours KYC.
 *
 * Seule classe du chemin de pré-remplissage à connaître `profiles` : le port
 * et le module de traduction, eux, l'ignorent. C'est ici — et uniquement ici —
 * qu'il faudra intervenir si l'identité vient un jour d'ailleurs.
 *
 * Le module `payments` importe déjà `ProfilesModule`, qui exporte
 * `PROFIL_REPOSITORY` : aucun accès direct à TypeORM n'est introduit, et la
 * dépendance passe par le port de `profiles`, pas par ses entités.
 *
 * Les personnes morales sont hors périmètre : `business_type: 'individual'`
 * est figé côté création de compte, un profil PM n'aurait donc rien à
 * pré-remplir de pertinent.
 */
@Injectable()
export class ProfilInvestorIdentityAdapter implements InvestorIdentityReader {
  constructor(
    @Inject(PROFIL_REPOSITORY)
    private readonly profils: ProfilRepository,
  ) {}

  async findByUserId(userId: number): Promise<InvestorIdentity | null> {
    const profil = await this.profils.findProfilPPByUserId(userId);
    if (!profil) return null;

    return {
      firstName: profil.prenom ?? null,
      lastName: profil.nom ?? null,
      birthDate: profil.dateNaissance ?? null,
      addressLine1: profil.adresseLigne1 ?? null,
      addressLine2: profil.adresseLigne2 ?? null,
      postalCode: profil.codePostal ?? null,
      city: profil.ville ?? null,
      country: profil.pays ?? null,
      phone: profil.telephone ?? null,
    };
  }
}

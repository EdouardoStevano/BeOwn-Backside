import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import type { User } from 'src/iam/domains/models/user';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/profiles/domains/ports/kyc.repository';
import type { KycSnapshot } from 'src/profiles/domains/kyc';

/**
 * Le titulaire d'un dossier, tel que la liste d'administration l'affiche.
 *
 * Une **projection de présentation**, pas un morceau du dossier : rien ici
 * n'est écrit et aucune règle du contexte Profiles ne s'en sert. Elle vivait
 * dans l'agrégat `Kyc`, remplie par une jointure ORM vers `UserEntity` ; elle
 * est maintenant composée ici, à partir du port d'IAM. La forme du JSON est
 * identique — `GET /profiles/kyc/all` rend les mêmes clés qu'avant.
 */
export interface TitulaireKyc {
  userId: number;
  firstname?: string;
  lastname?: string;
  role: string;
  status: string;
  createdAt?: Date;
  userEmail?: { email: string };
}

/** Une ligne de la liste admin : le dossier, plus qui il concerne. */
export type LigneKycAdmin = KycSnapshot & { utilisateur?: TitulaireKyc };

@Injectable()
export class GetKycUseCase {
  constructor(
    @Inject(KYC_REPOSITORY) private readonly kycRepository: KycRepository,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(userId: number) {
    const kyc = await this.kycRepository.findByUserId(userId);
    if (!kyc) {
      throw new NotFoundException('KYC non trouvé');
    }
    return kyc;
  }

  /**
   * Liste paginée pour le back-office, chaque dossier accompagné de son
   * titulaire.
   *
   * **Une seule requête pour les comptes de la page**, pas une par ligne : les
   * identifiants sont connus dès que la page de dossiers est lue, le port les
   * résout en lot. C'est ce qui rend le remplacement de la jointure ORM sans
   * conséquence sur le nombre d'aller-retours.
   *
   * Un compte introuvable laisse la clé `utilisateur` absente plutôt que de
   * faire échouer la page : c'était déjà le comportement quand la jointure
   * était un `LEFT JOIN`, et une liste d'administration doit rester consultable
   * même sur une donnée incohérente.
   */
  async executeAll(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ items: LigneKycAdmin[]; total: number }> {
    const { items, total } = await this.kycRepository.findAll(params);

    const titulaires = await this.userRepository.findManyByIds(
      items.map((kyc) => kyc.utilisateurId),
    );
    const parId = new Map(titulaires.map((user) => [user.userId, user]));

    return {
      items: items.map((kyc) => {
        const titulaire = parId.get(kyc.utilisateurId);
        return {
          ...kyc.toJSON(),
          ...(titulaire ? { utilisateur: enTitulaire(titulaire) } : {}),
        };
      }),
      total,
    };
  }
}

/**
 * Ne reprend du compte que ce que la liste affiche. Volontairement pas
 * `user.toJSON()` : la vue admin des dossiers KYC n'a pas à publier tout ce
 * qu'IAM sait d'un compte, et la forme rendue ici est un contrat de cette
 * route, pas celui d'IAM.
 */
function enTitulaire(user: User): TitulaireKyc {
  const email = user.emailOrNull;
  return {
    userId: user.userId,
    firstname: user.firstname ?? undefined,
    lastname: user.lastname ?? undefined,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    ...(email ? { userEmail: { email } } : {}),
  };
}

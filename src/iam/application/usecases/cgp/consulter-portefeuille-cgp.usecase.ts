import { Inject, Injectable } from '@nestjs/common';
import {
  PORTEFEUILLE_INVESTISSEUR,
  type PortefeuilleInvestisseur,
} from 'src/iam/application/ports/portefeuille-investisseur.port';
import { User } from 'src/iam/domain/aggregates/user';
import { UserRole, UserType } from 'src/iam/domain/enums/user.enum';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';

/** Taux de rétrocession estimé, appliqué à l'encours. */
const TAUX_COMMISSION = 0.005;

export interface StatsCgp {
  cgpId: number;
  nbClients: number;
  nbInvestissements: number;
  totalAum: number;
  commissionEstimee: number;
}

export interface ClientCgp {
  userId: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  role: UserRole;
  userType: UserType | null;
  nbInvestissements: number;
  aum: number;
  createdAt: Date;
}

/**
 * Les deux lectures d'un conseiller sur son portefeuille.
 *
 * De la **composition**, comme `AccountOverviewModule` : la liste des clients
 * vient d'`identity`, leur poids du contexte des souscriptions, et rien ici ne
 * décide quoi que ce soit — sauf le taux de rétrocession, qui n'a pas d'autre
 * domicile aujourd'hui.
 *
 * Ce taux était écrit en dur dans le contrôleur (`totalAum * 0.005`) et reste
 * une constante : il vaut pour tous les conseillers, alors qu'une convention de
 * distribution se négocie. Le jour où elle se négociera, ce sera un contrat à
 * part entière — avec un taux, une assiette et des dates — pas une multiplication.
 */
@Injectable()
export class ConsulterPortefeuilleCgpUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PORTEFEUILLE_INVESTISSEUR)
    private readonly portefeuilles: PortefeuilleInvestisseur,
  ) {}

  async stats(cgpId: number): Promise<StatsCgp> {
    const { clients, resumes } = await this.charger(cgpId);

    let nbInvestissements = 0;
    let totalAum = 0;
    for (const resume of resumes.values()) {
      nbInvestissements += resume.nbInvestissements;
      totalAum += resume.encours;
    }
    totalAum = Math.round(totalAum * 100) / 100;

    return {
      cgpId,
      nbClients: clients.length,
      nbInvestissements,
      totalAum,
      commissionEstimee: Math.round(totalAum * TAUX_COMMISSION * 100) / 100,
    };
  }

  async clients(cgpId: number): Promise<ClientCgp[]> {
    const { clients, resumes } = await this.charger(cgpId);

    return clients.map((client) => {
      const resume = resumes.get(client.userId);
      return {
        userId: client.userId,
        firstName: client.firstname,
        lastName: client.lastname,
        email: client.emailOrNull,
        role: client.role,
        userType: client.userType,
        nbInvestissements: resume?.nbInvestissements ?? 0,
        aum: resume?.encours ?? 0,
        createdAt: client.createdAt,
      };
    });
  }

  /**
   * Une lecture des comptes, une du portefeuille — au lieu d'une requête par
   * client. La liste des clients faisait un aller-retour en base **par
   * client** pour ses souscriptions ; un conseiller à cent clients coûtait
   * cent-une requêtes.
   */
  private async charger(cgpId: number) {
    const clients: User[] = await this.users.findClientsDuCgp(cgpId);
    const resumes = await this.portefeuilles.resumerPour(
      clients.map((c) => c.userId),
    );
    return { clients, resumes };
  }
}

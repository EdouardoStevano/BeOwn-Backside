import { Inject, Injectable } from '@nestjs/common';
import { rolesWithPermission } from 'src/iam/domain/policies/role-permissions.policy';
import { UserStatus } from 'src/iam/domain/enums/user.enum';
import {
  AccesCompteRefuseError,
  UtilisateurIntrouvableError,
} from 'src/iam/domain/errors';
import { User } from 'src/iam/domain/aggregates/user';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';

/** Rôles détenant `users:manage` — back-office, mutation d'un compte tiers. */
const ROLES_GESTION: string[] = rolesWithPermission('users:manage');

export interface ModificationAdministrative {
  firstname?: string;
  lastname?: string;
  status?: UserStatus;
}

/**
 * Modification d'un compte par l'administration.
 *
 * Trois choses y vivaient dans le contrôleur : le contrôle de rôle relu en
 * base, l'application des champs, et la notification du titulaire. Les deux
 * dernières s'enchaînent selon ce qui a **réellement** changé — c'est
 * `User.rename` et `User.changerStatut` qui le disent, et c'est ce qui rend la
 * trace d'audit exacte sans relire l'état avant/après.
 *
 * Le titulaire n'est pas prévenu quand un administrateur modifie **son propre**
 * compte : il le sait déjà. Comportement d'origine, conservé.
 */
@Injectable()
export class UpdateUserByAdminUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  async execute(
    cible: number,
    modification: ModificationAdministrative,
    administrateurId: number,
  ): Promise<User> {
    await this.assertGestionnaireAutorise(administrateurId);

    const compte = await this.userRepository.findById(cible);
    if (!compte) throw new UtilisateurIntrouvableError();

    const modifies: string[] = [];
    if (
      modification.firstname !== undefined &&
      compte.rename(modification.firstname)
    ) {
      modifies.push('firstname');
    }
    if (
      modification.lastname !== undefined &&
      compte.rename(undefined, modification.lastname)
    ) {
      modifies.push('lastname');
    }
    if (
      modification.status !== undefined &&
      compte.changerStatut(modification.status)
    ) {
      modifies.push('status');
    }

    const misAJour = await this.userRepository.update(compte);

    if (modifies.length > 0 && cible !== administrateurId) {
      // Non attendu : la modification est acquise, prévenir le titulaire n'en
      // fait pas partie. Le service journalise ses propres échecs.
      void this.notificationEvents.profileUpdatedByAdmin(
        cible,
        modifies,
        administrateurId,
      );
    }

    return misAJour;
  }

  private async assertGestionnaireAutorise(
    administrateurId: number,
  ): Promise<void> {
    const administrateur = await this.userRepository.findById(administrateurId);
    if (!administrateur || !ROLES_GESTION.includes(administrateur.role)) {
      throw new AccesCompteRefuseError('Accès réservé aux administrateurs.');
    }
  }
}

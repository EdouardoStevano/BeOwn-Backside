import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { peutDemanderAccesPorteur } from 'src/porteur-access/domains/acces-porteur';
import {
  DemandeAccesPorteur,
  finDeCarence,
} from 'src/porteur-access/domains/demande-acces-porteur';
import {
  AccesPorteurDejaOuvertError,
  CompteIntrouvableError,
  DemandeAccesPorteurEnCoursError,
  DemandeTropRapprocheeError,
  RoleNonEligibleError,
} from 'src/porteur-access/domains/errors/porteur-access.errors';
import {
  DemandeAccesPorteurReader,
  DemandeAccesPorteurWriter,
} from '../ports/demande-acces-porteur.repository';
import type {
  JournalAudit,
  Notificateur,
} from '../ports/services-transverses.port';

/** Rôles qui instruisent — destinataires de l'alerte « nouvelle demande ». */
const INSTRUCTEURS = rolesWithPermission('porteur_access:review');

/**
 * Dépôt d'une demande d'accès porteur par un investisseur.
 *
 * Les CGU réservent l'attribution du statut de porteur à un examen par BeOwn :
 * ce use case n'accorde donc RIEN, il ouvre un dossier. Trois refus possibles,
 * dans cet ordre — chacun est une règle, pas un garde-fou technique :
 *   403 le rôle n'est pas celui d'un investisseur ;
 *   409 l'accès est déjà ouvert, ou une demande est déjà en cours ;
 *   429 la précédente demande a été refusée il y a moins de 30 jours.
 */
@Injectable()
export class SoumettreDemandePorteurUseCase {
  private readonly logger = new Logger(SoumettreDemandePorteurUseCase.name);

  constructor(
    private readonly lecture: DemandeAccesPorteurReader,
    private readonly ecriture: DemandeAccesPorteurWriter,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(NotificationService) private readonly notifications: Notificateur,
    @Inject(AuditLogService) private readonly audit: JournalAudit,
  ) {}

  async execute(commande: {
    utilisateurId: number;
    motivation: string;
    maintenant?: Date;
  }): Promise<DemandeAccesPorteur> {
    const maintenant = commande.maintenant ?? new Date();

    // Rôle et drapeau relus EN BASE : le jeton de l'appelant ne prouve rien
    // d'autre que son identité (ADR rôle relu en base, § 1).
    const acces = await this.users.findAccesPorteur(commande.utilisateurId);
    if (!acces) throw new CompteIntrouvableError();
    if (!peutDemanderAccesPorteur(acces.role)) throw new RoleNonEligibleError();
    if (acces.porteurAccess) throw new AccesPorteurDejaOuvertError();

    const enCours = await this.lecture.findEnCours(commande.utilisateurId);
    if (enCours) throw new DemandeAccesPorteurEnCoursError();

    // Throttle APPLICATIF : il compte des décisions, pas des requêtes. Le
    // palier HTTP protège l'infrastructure ; celui-ci protège le temps humain
    // de l'équipe qui instruit.
    const derniere = await this.lecture.findDerniereDecidee(
      commande.utilisateurId,
    );
    if (derniere) {
      const fin = finDeCarence(derniere);
      if (fin && maintenant < fin) throw new DemandeTropRapprocheeError(fin);
    }

    // `creer` traduit une violation de l'index unique partiel en
    // DemandeAccesPorteurEnCoursError : la vérification ci-dessus reste utile
    // (message net, aucune écriture inutile) mais ce n'est PAS elle qui tient
    // sous concurrence — c'est la base.
    const demande = await this.ecriture.creer(
      DemandeAccesPorteur.soumettre({
        utilisateurId: commande.utilisateurId,
        motivation: commande.motivation,
        maintenant,
      }),
    );

    // Hors chemin critique : une alerte perdue ne doit pas annuler un dépôt
    // déjà enregistré. La file du back-office reste la source de vérité.
    this.notifications
      .pushToRoles({
        type: NotificationType.PORTEUR_ACCESS_DEMANDE,
        titre: "Nouvelle demande d'accès porteur",
        message:
          "Un investisseur demande l'ouverture de l'espace porteur. À instruire depuis le back-office.",
        roles: INSTRUCTEURS,
        metadata: {
          demandeId: demande.id,
          utilisateurId: demande.utilisateurId,
        },
      })
      .catch((erreur: unknown) =>
        this.logger.warn(
          `Alerte back-office non émise pour la demande ${demande.id} : ${String(erreur)}`,
        ),
      );

    await this.audit
      .create(
        String(commande.utilisateurId),
        acces.role,
        'porteur_access.demande.soumise',
        'demande_acces_porteur',
        demande.id ?? undefined,
        undefined,
        undefined,
        { longueurMotivation: demande.motivation.length },
      )
      .catch(() => {});

    return demande;
  }
}

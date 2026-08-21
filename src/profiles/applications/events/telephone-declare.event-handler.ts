import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { ChangerTelephoneUseCase } from 'src/iam/application/usecases/account/changer-telephone.usecase';
import { ProfilPPCreeDomainEvent } from 'src/profiles/domains/events/profil-pp-cree.domain-event';
import { ProfilPPMisAJourDomainEvent } from 'src/profiles/domains/events/profil-pp-mis-a-jour.domain-event';

/** Les deux faits qui portent un numéro déclaré au formulaire de profil. */
type ProfilPPDeclare = ProfilPPCreeDomainEvent | ProfilPPMisAJourDomainEvent;

/**
 * Reporte sur le compte le numéro de rappel déclaré en complétant ou en
 * corrigeant son profil.
 *
 * **Où vit cet abonnement, et pourquoi ici.** C'est bien IAM qui consomme : le
 * numéro est à lui. Mais avec un bus en mémoire, s'abonner suppose d'importer
 * la classe de l'événement — un handler placé dans IAM ferait donc dépendre
 * IAM de Profiles, exactement le cycle que le contexte a passé un commit à
 * rompre (IAM est le plus amont, une vingtaine de modules en dépendent).
 * L'abonnement reste donc du côté qui a le droit de dépendre de l'autre, et
 * **ne contient aucune règle d'IAM** : il délègue à
 * {@link ChangerTelephoneUseCase}, qui décide comment un compte enregistre son
 * numéro. Profiles dit *quand*, IAM dit *comment*.
 *
 * Le jour où ce report devra franchir une frontière de processus, c'est un
 * Integration Event qu'il faudra publier (§8), et l'abonné vivra alors
 * naturellement chez le consommateur.
 *
 * **Le profil reste enregistré quoi qu'il arrive ici.** Le bus publie de façon
 * synchrone mais n'attend pas les réactions : le titulaire reçoit sa réponse
 * dès que le dossier est écrit. En contrepartie le report est **différé** — un
 * échec ne remonte pas à l'appelant, d'où la trace : c'est une donnée que le
 * titulaire vient de saisir, la perdre en silence serait le pire des cas.
 */
@EventsHandler(ProfilPPCreeDomainEvent, ProfilPPMisAJourDomainEvent)
export class TelephoneDeclareEventHandler implements IEventHandler<ProfilPPDeclare> {
  private readonly logger = new Logger(TelephoneDeclareEventHandler.name);

  constructor(private readonly changerTelephone: ChangerTelephoneUseCase) {}

  async handle(event: ProfilPPDeclare): Promise<void> {
    // Rien de déclaré : il n'y a pas de « ne pas toucher » à exprimer, on
    // s'abstient avant même de lire le compte.
    if (event.telephoneDeclare === undefined) return;

    try {
      await this.changerTelephone.execute(
        event.utilisateurId,
        event.telephoneDeclare,
      );
    } catch (err) {
      this.logger.error(
        `Numéro de rappel non enregistré pour l'utilisateur ${event.utilisateurId} — le profil est bien enregistré, mais le compte a gardé son ancien numéro.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}

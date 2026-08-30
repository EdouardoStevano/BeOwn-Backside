import { Inject, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import {
  DOSSIER_ENTREE_EN_RELATION_REPOSITORY,
  type DossierDEntreeEnRelationRepository,
} from 'src/onboarding/domain/repositories/dossier-d-entree-en-relation.repository';
import { DossierDePiecesCompleteDomainEvent } from 'src/onboarding/domain/events/dossier-de-pieces-complete.domain-event';
import { DossierDePiecesIncompletDomainEvent } from 'src/onboarding/domain/events/dossier-de-pieces-incomplet.domain-event';

type CompletudeDuDossier =
  | DossierDePiecesCompleteDomainEvent
  | DossierDePiecesIncompletDomainEvent;

/**
 * Ce que la complétude du dossier de pièces fait au verdict KYB de la société.
 *
 * **Le pont entre deux agrégats qui ne se connaissent pas.**
 * `DossierDePieces` constate ce qui manque ; `DossierDEntreeEnRelation` décide
 * ce que la société a le droit de faire. Les deux sont deux frontières
 * transactionnelles (§17), donc le passage de l'un à l'autre est un événement,
 * pas un appel — c'est ce qui interdit à un use case d'écrire les deux d'un
 * geste et de laisser l'un des deux à moitié enregistré (§18).
 *
 * Deux événements, un seul abonné : ce sont les deux faces d'une même règle, et
 * les séparer en deux classes aurait dupliqué la lecture de la racine et la
 * gestion d'erreur pour une différence d'une ligne.
 *
 * | Fait                        | Transition                        |
 * | --------------------------- | --------------------------------- |
 * | le dossier est complet      | `soumettreLeKybALinstruction()`    |
 * | le dossier ne l'est plus    | `rouvrirLeKyb(motif)`              |
 *
 * **Aucune des deux ne valide.** Complet veut dire « prêt à être lu », pas
 * « accepté » : la décision reste humaine, et c'est `DeciderKybUseCase` qui la
 * porte. Valider ici ferait dire au dossier qu'il a été instruit alors que
 * personne ne l'a ouvert — inopposable devant l'AMF.
 *
 * **Le dossier de pièces reste acquis quoi qu'il arrive ici** : le bus n'attend
 * pas les réactions. Un échec est journalisé plutôt qu'avalé, parce que la
 * conséquence n'est pas symétrique — un `rouvrirLeKyb` perdu laisse une société
 * habilitée alors qu'une de ses pièces vient d'être refusée, et c'est un défaut
 * de conformité, pas un désagrément d'affichage.
 */
@EventsHandler(
  DossierDePiecesCompleteDomainEvent,
  DossierDePiecesIncompletDomainEvent,
)
export class CompletudeDuDossierEventHandler implements IEventHandler<CompletudeDuDossier> {
  private readonly logger = new Logger(CompletudeDuDossierEventHandler.name);

  constructor(
    @Inject(DOSSIER_ENTREE_EN_RELATION_REPOSITORY)
    private readonly profils: DossierDEntreeEnRelationRepository,
  ) {}

  async handle(event: CompletudeDuDossier): Promise<void> {
    const complet = event instanceof DossierDePiecesCompleteDomainEvent;

    try {
      // Jamais `null` : une société dont le dossier n'a jamais été écrit rend
      // une racine vierge, que `save` fera naître. C'est un état normal — on
      // dépose ses pièces avant d'avoir un dossier de conformité.
      const profil = await this.profils.parSociete(
        event.utilisateurId,
        event.societeId,
      );

      if (complet) {
        // Sans effet si le dossier est déjà instruit ou tranché : les
        // événements se redélivrent, et une acceptation de plus ne doit pas
        // défaire une décision (voir `DecisionKyb.soumise`).
        profil.soumettreLeKybALinstruction();
      } else {
        profil.rouvrirLeKyb(event.motif);
      }

      await this.profils.save(profil);
    } catch (err) {
      this.logger.error(
        complet
          ? `Dossier complet de la société ${event.societeId} non soumis à l'instruction — les pièces sont réunies, mais l'équipe conformité ne le verra pas dans sa file.`
          : `Dossier redevenu incomplet pour la société ${event.societeId} sans que son KYB soit rouvert — elle peut rester habilitée à opérer alors qu'un justificatif lui manque.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}

import { EventBus } from '@nestjs/cqrs';
import { DossierDePieces } from 'src/onboarding/domain/aggregates/dossier-de-pieces';
import { libelleDesPiecesManquantes } from 'src/onboarding/domain/domain-services/aptitude-du-profil.domain-service';
import { DossierDePiecesCompleteDomainEvent } from 'src/onboarding/domain/events/dossier-de-pieces-complete.domain-event';
import { DossierDePiecesIncompletDomainEvent } from 'src/onboarding/domain/events/dossier-de-pieces-incomplet.domain-event';

/**
 * Annonce où en est le dossier après qu'on y a touché.
 *
 * **Les trois gestes qui modifient un dossier passent par ici** — déposer,
 * accepter, refuser — et c'est tout l'intérêt : ils publient donc le même fait,
 * évalué par la même règle. Le recopier trois fois aurait suffi à ce qu'un
 * chemin oublie de révoquer un KYB validé, et c'est précisément le chemin qui
 * compte pour le régulateur.
 *
 * Une fonction et non un service injectable : elle ne tient aucun état, ne lit
 * rien, et n'a besoin que de ce qu'on lui passe. En faire une classe
 * `@Injectable` n'ajouterait qu'un constructeur à trois use cases.
 *
 * **Toujours appelée après l'écriture.** Un abonné qui remettrait un KYB en
 * constitution sur un refus non enregistré ferait diverger les deux agrégats —
 * et ils ne partagent pas de transaction (§17, §18).
 */
export function annoncerLaCompletude(
  eventBus: EventBus,
  dossier: DossierDePieces,
  societe: { id: string; utilisateurId: number },
  beneficiaires: readonly string[],
  maintenant: Date = new Date(),
): void {
  const manquantes = dossier.piecesManquantes(beneficiaires, maintenant);

  if (manquantes.length === 0) {
    eventBus.publish(
      new DossierDePiecesCompleteDomainEvent(societe.utilisateurId, societe.id),
    );
    return;
  }

  // Un fait est publié **dans les deux cas**, jamais seulement le bon. Ne
  // signaler que la complétude laisserait un dossier validé le rester après
  // qu'une de ses pièces a été refusée ou remplacée.
  eventBus.publish(
    new DossierDePiecesIncompletDomainEvent(
      societe.utilisateurId,
      societe.id,
      libelleDesPiecesManquantes(manquantes),
    ),
  );
}

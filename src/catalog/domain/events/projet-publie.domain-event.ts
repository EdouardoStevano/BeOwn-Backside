import type { DomainEvent } from 'src/shared/kernel/domain/domain-event';
import { ProjectStatus, ProjectType } from '../enums/project-status.enum';

/**
 * Un projet vient d'être ouvert au catalogue — le fait métier, pas l'ordre de
 * prévenir les investisseurs.
 *
 * Levé à la **création** d'un projet qui ne naît pas brouillon. Il ne couvre
 * donc pas les publications ultérieures : un brouillon qui passe en annonce
 * lève {@link ProjetAnnonceDomainEvent}, et l'ouverture de la collecte
 * {@link CollecteOuverteDomainEvent}. Trois faits distincts, trois campagnes
 * distinctes.
 *
 * La charge est mince — de quoi composer une annonce et pointer le projet ; un
 * abonné qui a besoin de plus le relit.
 *
 * `IEvent` est le seul emprunt de ce fichier à NestJS ; interface marqueur,
 * importée en `import type`, donc absente du code compilé (§6 / §12.1).
 */
export class ProjetPublieDomainEvent implements DomainEvent {
  constructor(
    public readonly projetId: string,
    public readonly slug: string,
    public readonly titre: string,
    public readonly type: ProjectType,
    public readonly statut: ProjectStatus,
    public readonly ville: string | null,
    /** Libellé « Ville, Pays », vide si ni l'une ni l'autre. */
    public readonly lieu: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

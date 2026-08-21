import type { IEvent } from '@nestjs/cqrs';
import { ProjectType } from '../enums/project-status.enum';

/**
 * Un porteur vient de soumettre un dossier pour revue.
 *
 * Le dossier naît brouillon et rattaché à son compte : il n'est visible de
 * personne, et le porteur ne peut pas l'auto-publier. Ce qui suit — la due
 * diligence avant publication — est du ressort de l'administration, d'où
 * l'annonce.
 *
 * Distinct de {@link ProjetPublieDomainEvent} : celui-ci s'adresse aux
 * administrateurs et ne dit rien au catalogue.
 */
export class ProjetSoumisDomainEvent implements IEvent {
  constructor(
    public readonly projetId: string,
    public readonly slug: string,
    public readonly titre: string,
    public readonly type: ProjectType,
    public readonly porteurId: number,
    public readonly ville: string | null,
    /** Libellé « Ville, Pays », vide si ni l'une ni l'autre. */
    public readonly lieu: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

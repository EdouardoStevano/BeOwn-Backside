import type { DomainEvent } from 'src/shared/kernel/domain/domain-event';

/**
 * Un investisseur vient de consulter le même projet une deuxième fois.
 *
 * Le fait est levé **au passage** à la deuxième consultation, une seule fois :
 * c'est le signal d'intérêt qu'attend le chargé de relation, et le répéter à
 * chaque visite suivante le noierait. Le compteur est tenu par
 * `PROJECT_VIEW_REPOSITORY`.
 *
 * La règle vivait dans une méthode privée de `ProjectController`, entre un
 * `Repository<ProjectViewEntity>` TypeORM injecté à même la présentation (§12.9)
 * et un appel direct au service de notifications.
 */
export class ProjetReconsulteDomainEvent implements DomainEvent {
  constructor(
    public readonly projetId: string,
    public readonly projetTitre: string,
    public readonly utilisateurId: number,
    /** Nombre de consultations atteint — vaut 2 par construction. */
    public readonly nbConsultations: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

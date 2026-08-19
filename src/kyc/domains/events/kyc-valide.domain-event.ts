import type { IEvent } from '@nestjs/cqrs';

/**
 * Un dossier vient d'être validé par une décision humaine — le fait métier, pas
 * l'ordre de prévenir son titulaire.
 *
 * **Ne couvre que la décision manuelle.** La validation automatique par Stripe
 * Identity emprunte un autre chemin (webhook → `UpdateKycStatusUseCase`) et
 * n'annonce rien pour l'instant ; `decidePar` n'aurait d'ailleurs personne à
 * désigner. Le jour où ce chemin lèvera lui aussi un fait, ce sera le sien —
 * les abonnés d'ici supposent qu'un administrateur a tranché.
 *
 * Il est levé une fois le dossier passé en `VALIDE` : annoncer plus tôt
 * exposerait à féliciter un titulaire dont la validation échoue ensuite. La
 * charge est mince — de quoi identifier le dossier, son titulaire et l'auteur
 * de la décision ; un abonné qui a besoin de plus relit le dossier.
 *
 * `IEvent` est le seul emprunt de ce fichier à NestJS ; interface marqueur,
 * importée en `import type`, donc absente du code compilé (§6 / §12.1).
 */
export class KycValideDomainEvent implements IEvent {
  constructor(
    public readonly kycId: string,
    public readonly utilisateurId: number,
    /** Compte de l'administrateur qui a tranché — tracé pour l'audit. */
    public readonly decidePar: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

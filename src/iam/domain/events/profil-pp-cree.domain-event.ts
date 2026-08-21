import type { IEvent } from '@nestjs/cqrs';

/**
 * Un profil investisseur personne physique vient d'être complété.
 *
 * Il est levé une fois le dossier persisté : avant, il n'y aurait rien à
 * annoncer, et un abonné agirait sur un profil dont la création peut encore
 * échouer.
 *
 * **Pourquoi il porte un numéro de téléphone.** Le formulaire de complétion
 * alimente deux propriétaires : le dossier réglementaire, et le compte — qui
 * détient l'état civil et le numéro de rappel depuis qu'ils ont quitté
 * `profil_pp`. Le dossier ne garde pas ce numéro ; sans le transporter ici,
 * l'abonné n'aurait aucun moyen de savoir ce qui a été déclaré. C'est donc
 * bien une donnée du **fait** — « voilà ce que le titulaire a déclaré en
 * complétant son profil » — et non un ordre d'écriture.
 *
 * `undefined` signifie « le formulaire n'en portait pas », ce qui n'est pas la
 * même chose que `null` — voir `User.changerTelephone`.
 *
 * `IEvent` est le seul emprunt de ce fichier à NestJS ; interface marqueur,
 * importée en `import type`, donc absente du code compilé (§6 / §12.1).
 */
export class ProfilPPCreeDomainEvent implements IEvent {
  constructor(
    public readonly utilisateurId: number,
    public readonly telephoneDeclare: string | undefined,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

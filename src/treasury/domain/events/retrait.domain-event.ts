import type { DomainEvent } from 'src/shared/kernel/domain/domain-event';
import type { Money } from '../value-objects/money.vo';

/**
 * Les faits de la vie d'un retrait — **au passé**, comme le veut §12.
 *
 * Ils remplacent cinq appels directs au port de notification, disséminés dans
 * quatre use cases. La différence n'est pas de plomberie : un use case qui
 * notifie **décide qui doit savoir**, ce qui n'est pas sa responsabilité (§14).
 * Ici, il constate un fait ; qui s'y intéresse, et par quel canal, appartient à
 * l'abonné (§38.3 — Observer).
 *
 * Le gain se voit au premier changement : ajouter une écriture au journal
 * d'audit sur les retraits échoués, ou prévenir la finance au-delà d'un
 * certain montant, se fait par un abonné de plus — sans rouvrir une seule ligne
 * du parcours de retrait.
 *
 * Ils portent des {@link Money} et non des nombres : ces événements ne
 * franchissent pas la frontière du contexte — `notifications` n'y est pas
 * abonné, c'est l'adaptateur du port qui traduit (§3.3).
 */

/** Ce que tout fait de retrait porte : de qui, de quoi, et combien. */
abstract class FaitDeRetrait implements DomainEvent {
  readonly occurredAt = new Date();

  protected constructor(
    public readonly utilisateurId: number,
    public readonly transactionId: string,
    public readonly montant: Money,
  ) {}
}

/**
 * Les fonds ont quitté la plateforme vers le compte du titulaire.
 *
 * « En route » et non « versé » : le transfert a réussi, l'arrivée en banque
 * n'est acquise qu'au `payout.paid`. Annoncer l'arrivée ici ferait attendre au
 * titulaire un virement qui peut encore échouer.
 */
export class RetraitEnRouteDomainEvent extends FaitDeRetrait {
  constructor(utilisateurId: number, transactionId: string, montant: Money) {
    super(utilisateurId, transactionId, montant);
  }
}

/**
 * Le portefeuille est débité, et la demande attend le back-office.
 *
 * Le seul fait de retrait dont le destinataire n'est **pas** le titulaire :
 * c'est une tâche pour l'équipe finance, pas une nouvelle pour l'investisseur.
 */
export class RetraitADemanderManuellementDomainEvent extends FaitDeRetrait {
  constructor(
    utilisateurId: number,
    transactionId: string,
    montant: Money,
    /** Où verser — la raison d'être de ce parcours de secours. */
    public readonly ibanDestination: string | null,
  ) {
    super(utilisateurId, transactionId, montant);
  }
}

/** Les fonds sont arrivés sur le compte bancaire du titulaire. */
export class RetraitVerseDomainEvent extends FaitDeRetrait {
  constructor(utilisateurId: number, transactionId: string, montant: Money) {
    super(utilisateurId, transactionId, montant);
  }
}

/**
 * Le retrait n'a pas abouti, et le solde a été rendu au titulaire.
 *
 * Publié **après** le recrédit, jamais avant : annoncer un remboursement qui
 * n'a pas eu lieu est pire que ne rien annoncer.
 */
export class RetraitEchoueDomainEvent extends FaitDeRetrait {
  constructor(utilisateurId: number, transactionId: string, montant: Money) {
    super(utilisateurId, transactionId, montant);
  }
}

/**
 * Un retrait que la plateforme ne sait pas dénouer seule.

 * Deux situations, un seul fait, parce qu'elles appellent le même geste — un
 * humain reprend le dossier :
 *
 * - le versement a échoué et le rapatriement des fonds n'a pas abouti :
 *   recréditer à l'aveugle créerait de l'argent ;
 * - un versement a échoué sans référence de retrait — un versement automatique
 *   du fournisseur, que la plateforme n'a pas demandé et ne sait pas rattacher.
 *
 * Il n'hérite pas de {@link FaitDeRetrait} : dans le second cas, il n'y a
 * précisément **aucun** retrait identifié, et lui en imposer un obligerait à en
 * inventer un.
 */
export class RetraitEnSouffranceDomainEvent implements DomainEvent {
  readonly occurredAt = new Date();

  constructor(
    /** Ce qui s'est passé, dit à qui devra le reprendre. */
    public readonly titre: string,
    public readonly message: string,
    /** Les références utiles à l'enquête — transfert, versement, compte. */
    public readonly contexte: Record<string, unknown> = {},
  ) {}
}

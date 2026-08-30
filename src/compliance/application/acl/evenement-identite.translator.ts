import { VerdictIdentite } from 'src/compliance/domain/value-objects/verdict-identite';

/** Ce que le contexte retient d'un événement de vérification d'identité. */
export interface EvenementDeVerification {
  verdict: VerdictIdentite;
  utilisateurId: number;
  /** Session du fournisseur, pour distinguer redélivrance et nouvelle tentative. */
  sessionId: string;
  /** Identifiant de l'événement — ne sert qu'à la trace et à l'audit. */
  evenementId: string;
  /** Renseigné par {@link VerdictIdentite.REVUE_REQUISE} : pourquoi ça a échoué. */
  motif: string;
}

/** Motif par défaut quand le fournisseur n'en donne aucun. */
const MOTIF_PAR_DEFAUT = 'Vérification en attente de révision manuelle';

/**
 * Le verdict que porte l'**état** d'une session, indépendamment de tout
 * événement.
 *
 * Les mêmes trois mots que les événements, parce que le fournisseur nomme
 * l'événement d'après l'état qu'il annonce. Ils sont écrits ici séparément
 * plutôt que dérivés du nom d'événement : la coïncidence est celle de Stripe
 * aujourd'hui, pas un contrat, et la déduire par découpage de chaîne ferait
 * dépendre notre lecture d'une convention de nommage tierce.
 *
 * `canceled` n'y figure pas : une session annulée n'apprend rien sur
 * l'identité, elle dit seulement qu'on ne saura pas par ce chemin-là.
 */
const VERDICT_PAR_ETAT_DE_SESSION: Readonly<Record<string, VerdictIdentite>> = {
  verified: VerdictIdentite.VERIFIEE,
  processing: VerdictIdentite.EN_TRAITEMENT,
  requires_input: VerdictIdentite.REVUE_REQUISE,
};

const VERDICT_PAR_EVENEMENT: Readonly<Record<string, VerdictIdentite>> = {
  'identity.verification_session.verified': VerdictIdentite.VERIFIEE,
  'identity.verification_session.processing': VerdictIdentite.EN_TRAITEMENT,
  'identity.verification_session.requires_input': VerdictIdentite.REVUE_REQUISE,
};

/**
 * **Anti-Corruption Layer vers Stripe Identity** (§20) — le seul endroit du
 * contexte qui connaisse la forme d'un événement Stripe.
 *
 * `event.data.object`, `session.metadata.userId`, `session.last_error.reason` :
 * ces chemins étaient lus dans le use case du webhook, si bien qu'un
 * changement de fournisseur — le cahier des charges en cite trois — aurait
 * demandé de rouvrir la logique métier pour en extraire des accès JSON. Ici,
 * le choc est absorbé par une classe qui ne fait que traduire.
 *
 * **Tout ce qui est illisible devient `null`**, jamais une exception : un
 * événement orphelin (compte supprimé, metadata absente, type inconnu) ne doit
 * pas faire échouer le webhook. Stripe considère un 5xx comme un échec de
 * livraison et rejoue l'événement — indéfiniment, pour une donnée qui ne
 * deviendra jamais valide.
 */
export class EvenementIdentiteTranslator {
  /** Vrai si cet événement relève de la vérification d'identité. */
  static concerne(eventType: string): boolean {
    return eventType in VERDICT_PAR_EVENEMENT;
  }

  /**
   * @returns le fait métier, ou `null` si l'événement ne dit rien
   * d'exploitable — à charge de l'appelant d'en faire un no-op.
   */
  static traduire(event: unknown): EvenementDeVerification | null {
    const brut = event as {
      id?: string;
      type?: string;
      data?: { object?: Record<string, any> };
    } | null;

    const verdict = VERDICT_PAR_EVENEMENT[brut?.type ?? ''];
    if (!verdict) return null;

    const session = brut?.data?.object;
    const utilisateurId = parseInt(session?.metadata?.userId as string, 10);
    if (isNaN(utilisateurId)) return null;

    return {
      verdict,
      utilisateurId,
      sessionId: (session?.id as string) ?? '',
      evenementId: brut?.id ?? '',
      // Le code d'erreur en second recours : moins lisible que la raison, mais
      // un motif technique renseigne mieux le RCCI qu'une phrase générique.
      motif:
        (session?.last_error?.reason as string) ??
        (session?.last_error?.code as string) ??
        MOTIF_PAR_DEFAUT,
    };
  }

  /**
   * Le même fait métier, lu sur l'**état** d'une session plutôt que sur un
   * événement.
   *
   * Deux chemins mènent au verdict d'un fournisseur : il nous l'annonce
   * (webhook), ou nous allons le chercher (réconciliation). Le second existe
   * parce que le premier n'arrive pas toujours — un poste de développement
   * n'est pas joignable depuis l'extérieur, et une livraison peut échouer en
   * production.
   *
   * Le titulaire est **fourni** et non lu dans les métadonnées : on relit une
   * session parce qu'on cherche le dossier de quelqu'un de précis, et il n'y a
   * aucune raison de faire confiance au fournisseur sur ce point-là quand on
   * le connaît déjà.
   *
   * @returns `null` si l'état ne porte aucun verdict — une session annulée, ou
   *   un état que ce fournisseur ajouterait demain.
   */
  static depuisLaSession(
    session: { sessionId: string; status: string; motifEchec?: string },
    utilisateurId: number,
  ): EvenementDeVerification | null {
    const verdict = VERDICT_PAR_ETAT_DE_SESSION[session.status];
    if (!verdict) return null;

    return {
      verdict,
      utilisateurId,
      sessionId: session.sessionId,
      // Il n'y a pas d'événement : la trace d'audit dit d'où vient le fait.
      // Un identifiant inventé qui ressemblerait à celui du fournisseur
      // rendrait les deux chemins indiscernables dans le journal.
      evenementId: `reconciliation:${session.sessionId}`,
      motif: session.motifEchec ?? MOTIF_PAR_DEFAUT,
    };
  }
}

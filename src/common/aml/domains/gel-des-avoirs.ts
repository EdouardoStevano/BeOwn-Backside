/**
 * Gel des avoirs (art. L. 562-4 CMF) — vocabulaire du domaine.
 *
 * Le code et le message sont UNIQUES pour les quatre chemins d'argent sortant
 * (dépôt, souscription, retrait, achat au marché secondaire) : produire des
 * variantes révélerait le mécanisme de blocage (note d'implémentation du
 * document de conformité `docs/conformite/2026-09-03-baremes-lot2.md`, § 4.1).
 *
 * Le message ne cite aucune autorité, ne qualifie pas la personne et
 * n'accuse pas : il constate une restriction au titre d'obligations légales.
 */

/** Code d'erreur stable renvoyé en 403 sur les quatre chemins bloqués. */
export const CODE_AVOIRS_GELES = 'AVOIRS_GELES';

/**
 * Message utilisateur neutre — texte de la mission conformité (§ 4.1),
 * verbatim. Seul le contact varie : le document le laisse « à compléter »,
 * l'adresse effective vient de la configuration (voir GelDesAvoirsService).
 */
export function messageAvoirsGeles(contactEmail: string): string {
  return (
    "Cette opération n'est pas disponible sur votre compte actuellement. " +
    "Certaines opérations font l'objet d'une restriction temporaire en " +
    'application de nos obligations légales. Votre solde et vos ' +
    'investissements restent enregistrés sur votre compte. Pour toute ' +
    `question, contactez-nous à ${contactEmail}.`
  );
}

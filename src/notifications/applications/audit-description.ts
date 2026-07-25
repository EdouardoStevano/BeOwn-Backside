/**
 * Libellé FR lisible d'une action d'audit, dérivé à la lecture depuis
 * `action` ("<METHOD> <routePath>") + objetType. Purement présentationnel :
 * ne throw jamais, fallback générique si l'action n'est pas reconnue.
 */
const VERBE: Record<string, string> = {
  POST: 'Création de',
  PUT: 'Modification de',
  PATCH: 'Modification de',
  DELETE: 'Suppression de',
};

/** Suffixes de route → préfixe métier (prioritaire sur le verbe HTTP). */
const SUFFIXES: { re: RegExp; prefix: string }[] = [
  { re: /\/approve$/i, prefix: 'Approbation de' },
  { re: /\/reject$/i, prefix: 'Refus de' },
  { re: /\/process$/i, prefix: 'Traitement de' },
  { re: /\/publish$/i, prefix: 'Publication de' },
  { re: /\/cancel$/i, prefix: 'Annulation de' },
  { re: /\/(validate|valider)$/i, prefix: 'Validation de' },
  { re: /\/(pay|payer)$/i, prefix: 'Paiement de' },
  { re: /\/execute$/i, prefix: 'Exécution de' },
  { re: /\/suspend$/i, prefix: 'Suspension de' },
  { re: /\/activate$/i, prefix: 'Activation de' },
  { re: /\/trigger|\/declencher$/i, prefix: 'Déclenchement de' },
];

/** objetType → groupe nominal (avec article). */
const OBJET: Record<string, string> = {
  retraits: 'un retrait',
  echeances: 'une échéance',
  projects: 'un projet',
  users: 'un utilisateur',
  kyc: 'un dossier KYC',
  distributions: 'une distribution',
  locatif: 'un élément locatif',
  market: 'un ordre de marché',
  reservations: 'une réservation',
  settings: 'les paramètres',
  news: 'une actualité',
  investments: 'un investissement',
};

export function describeAuditAction(
  action: string,
  objetType: string | null,
  _statusCode?: number,
): string {
  const method = (action || '').split(' ')[0]?.toUpperCase() ?? '';
  const path = (action || '').split(' ').slice(1).join(' ');

  const prefix =
    SUFFIXES.find((s) => s.re.test(path))?.prefix ??
    VERBE[method] ??
    'Action sur';

  const objet = objetType
    ? (OBJET[objetType] ?? `« ${objetType} »`)
    : 'un objet';

  return `${prefix} ${objet}`
    .replace(/\bde un\b/g, "d'un")
    .replace(/\bde une\b/g, "d'une")
    .replace(/\bde les\b/g, 'des')
    .replace(/\bde le\b/g, 'du')
    .trim();
}

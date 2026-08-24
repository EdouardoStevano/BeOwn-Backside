/**
 * Arrondit un montant au centime.
 *
 * Générique au sens de §25 : de l'arithmétique décimale, sans aucune notion de
 * domaine — sa place est ici, aux côtés de `formatEur`, et non dans un contexte.
 *
 * Il vivait dans `common/platform-fees/platform-fees.constants.ts`, ce qui
 * faisait qu'un fichier **domaine** de `secondary-market`
 * (`cout-acquisition.ts`) importait depuis le module des frais de plateforme —
 * une dépendance qu'un domaine ne doit pas avoir (§27).
 *
 * > Plusieurs use cases gardent leur propre `round2` privé, d'une ligne. Les
 * > rassembler ici n'apporterait rien : ce sont des détails de calcul locaux,
 * > pas un contrat partagé. Ce qui compte est qu'aucun **domaine** ne le tire
 * > d'un autre contexte.
 */
export const round2 = (montant: number): number =>
  Math.round(montant * 100) / 100;

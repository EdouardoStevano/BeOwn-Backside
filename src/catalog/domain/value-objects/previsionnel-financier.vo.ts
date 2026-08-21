/**
 * Plan de financement de l'opération, tel que l'analyste le saisit.
 *
 * Cette forme était déclarée dans `project.entity.ts` — donc dans
 * l'infrastructure — et le domaine l'importait de là (§1 : la flèche allait à
 * l'envers). Elle descend ici, et c'est l'entité ORM qui l'importe désormais
 * pour typer sa colonne `jsonb`.
 *
 * Aucune règle n'est posée dessus : les montants sont des données d'affichage,
 * jamais relues pour décider quoi que ce soit. C'est un type, pas un Value
 * Object au sens fort — d'où l'absence de classe.
 */
export interface PrevisionnelFinancier {
  operation: {
    acquisition: number;
    fraisNotaire: number;
    travaux: number;
    sequestre: number;
    fraisHypotheque: number;
    fraisFinanciers: number;
    autresCharges?: number;
  };
  financement: {
    apport: number;
    financementBancaire: number;
    montantInvestisseurs: number;
  };
  resultat: {
    montantRevente: number;
    coutOperation: number;
  };
}

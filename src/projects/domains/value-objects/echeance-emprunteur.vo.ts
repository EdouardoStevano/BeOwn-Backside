/**
 * Échéance de l'emprunteur, saisie par l'admin sur le projet lui-même.
 *
 * Les échéances côté investisseur (`EcheanceEntity`, contexte Investments) en
 * sont dérivées au prorata de chaque investissement.
 *
 * Le projet transporte cette colonne mais n'en fait rien : aucune règle de ce
 * contexte ne la lit, et l'agrégat {@link Project} ne la porte pas — la
 * remonter dans le domaine sans consommateur produirait un champ mort que
 * chaque `save()` risquerait d'écraser. Le type descend tout de même ici, avec
 * les autres formes `jsonb` du projet, pour que l'entité ORM n'ait plus à
 * déclarer de vocabulaire métier (§1).
 */
export interface EcheanceEmprunteur {
  id?: string;
  numero: number;
  /** Date civile ISO `AAAA-MM-JJ`. */
  datePrevue: string;
  montantCapital: number;
  montantInterets: number;
  montantFraisPlateforme: number;
  montantFraisRetard: number;
  tauxInteretsAnnuel: number;
  tauxRetardAnnuel: number;
  capitalRestantAvant?: number;
  capitalRestantApres?: number;
  montantTotal?: number;
  statut: 'a_venir' | 'verifiee' | 'en_paiement' | 'payee' | 'retard';
}

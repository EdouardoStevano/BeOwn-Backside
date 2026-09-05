/**
 * Port de suppression de fichiers distants (DIP/ISP) : le module RGPD n'a
 * besoin QUE de détruire un objet — ni upload, ni URL signée. L'abstract class
 * sert de contrat ET de token d'injection (convention du dépôt).
 *
 * Implémentation réelle : `CloudStorageService` (Cloudinary), câblée par
 * `useExisting` dans RgpdModule — sa méthode `delete(objectName)` honore ce
 * contrat (best-effort : elle journalise et n'échoue jamais, un fichier déjà
 * absent est un succès — ce qui rend l'anonymisation rejouable).
 *
 * CONTRAT : ne lève JAMAIS. Rend `true` quand la destruction a été acceptée par
 * le sous-traitant, `false` quand elle a échoué — l'appelant doit pouvoir
 * distinguer les deux pour ne pas déclarer détruit ce qui ne l'est pas
 * (accountability, art. 5.2 RGPD). Une implémentation qui lèverait au lieu de
 * rendre `false` romprait la substituabilité : l'anonymisation se déroule hors
 * transaction et une exception ici laisserait le compte à moitié traité.
 */
export abstract class StockageFichiersPort {
  abstract delete(objectName: string): Promise<boolean>;
}

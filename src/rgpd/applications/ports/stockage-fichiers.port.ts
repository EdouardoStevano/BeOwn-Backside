/**
 * Port de suppression de fichiers distants (DIP/ISP) : le module RGPD n'a
 * besoin QUE de détruire un objet — ni upload, ni URL signée. L'abstract class
 * sert de contrat ET de token d'injection (convention du dépôt).
 *
 * Implémentation réelle : `CloudStorageService` (Cloudinary), câblée par
 * `useExisting` dans RgpdModule — sa méthode `delete(objectName)` honore ce
 * contrat (best-effort : elle journalise et n'échoue jamais, un fichier déjà
 * absent est un succès — ce qui rend l'anonymisation rejouable).
 */
export abstract class StockageFichiersPort {
  abstract delete(objectName: string): Promise<void>;
}

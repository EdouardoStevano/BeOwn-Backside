/**
 * Une unité physique louable (appartement, local commercial, parking, etc.)
 * appartenant à un projet. Un projet peut avoir N unités.
 */
export class UniteLouable {
  id: string;
  projetId: string;
  reference: string; // ex. "Appartement 3B"
  surfaceM2: number | null;
  loyerMensuelCible: number; // loyer attendu théorique (réf pour valider)
  createdAt: Date;
  updatedAt: Date;
}

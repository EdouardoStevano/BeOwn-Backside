export class Avis {
  id: string;
  projetId: string;
  userId: number;
  note: number;
  commentaire: string | null;
  createdAt: Date;
  userFirstname?: string | null;
  userLastname?: string | null;
}

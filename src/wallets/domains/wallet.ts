import { WalletType } from './enums/wallet.enum';

export class Wallet {
  id: string;
  type: WalletType;
  proprietaireUserId: number | null;
  projetId: string | null;
  spvId: string | null;
  fournisseurRef: string;
  devise: string;
  solde: number;
  statut: string;
  createdAt: Date;
}

import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
} from '../enums/wallet.enum';

export class Transaction {
  id: string;
  walletSource: string | null;
  walletDestination: string | null;
  montant: number;
  devise: string;
  type: TransactionType;
  referenceExterne: string | null;
  fournisseur: TransactionFournisseur;
  statut: TransactionStatus;
  investissementId: string | null;
  echeanceId: string | null;
  reservationId: string | null;
  projetId: string | null;
  idempotencyKey: string | null;
  fraisPsp: number;
  fraisPlateforme: number;
  metadata: Record<string, unknown> | null;
  motifEchec: string | null;
  createdAt: Date;
  updatedAt: Date;
}

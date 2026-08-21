import { Inject, Injectable, Logger } from '@nestjs/common';
import { DocumentFiscal } from '../../domains/document-fiscal';
import {
  DOCUMENT_FISCAL_REPOSITORY,
  type DocumentFiscalRepository,
} from '../ports/repositories/document-fiscal.repository';
import {
  DISTRIBUTION_PART_REPOSITORY,
  type DistributionPartRepository,
} from 'src/distributions/applications/ports/repositories/distribution-part.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from 'src/subscription/domain/repositories/investment.repository';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Agrège pour un investisseur sur une année civile donnée :
 * - Tous les DistributionPart.payeLe tombant dans l'année
 * - Calcule montantBrut total, IR total, CSG total, montantNet total
 * - Persiste un DocumentFiscal (upsert sur userId + annee)
 *
 * Sera utilisé par :
 *   - Cron annuel (15 janvier de N+1) pour tous les investisseurs
 *   - Endpoint admin de régénération
 *   - Endpoint investisseur de téléchargement (génère à la volée si absent)
 *
 * NOTE : ne produit pas le PDF — celui-ci est généré au moment du download
 * (streaming) pour rester léger. Le champ pdfUrl reste null sauf si on
 * upload sur CloudStorage en lot (Phase 10).
 */
@Injectable()
export class GenerateInvestisseurIfuUseCase {
  private readonly logger = new Logger(GenerateInvestisseurIfuUseCase.name);

  constructor(
    @Inject(DOCUMENT_FISCAL_REPOSITORY)
    private readonly docRepo: DocumentFiscalRepository,
    @Inject(DISTRIBUTION_PART_REPOSITORY)
    private readonly partRepo: DistributionPartRepository,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepo: InvestmentRepository,
  ) {}

  async execute(userId: number, annee: number): Promise<DocumentFiscal> {
    const investments = await this.investmentRepo.findByUserId(userId);
    const confirmes = investments.filter(
      (i) => i.statut === InvestmentStatus.CONFIRME,
    );

    let montantBrut = 0;
    let montantIR = 0;
    let montantCSG = 0;
    let montantNet = 0;

    if (confirmes.length > 0) {
      const invIds = confirmes.map((i) => i.id);
      const parts = await this.partRepo.findByInvestissementIds(invIds);
      const partsAnnee = parts.filter((p) => {
        if (!p.payeLe) return false;
        const y =
          p.payeLe instanceof Date
            ? p.payeLe.getUTCFullYear()
            : new Date(p.payeLe).getUTCFullYear();
        return y === annee;
      });
      montantBrut = partsAnnee.reduce((s, p) => s + p.montantBrut, 0);
      montantIR = partsAnnee.reduce((s, p) => s + p.prelevementIR, 0);
      montantCSG = partsAnnee.reduce((s, p) => s + p.prelevementCSG, 0);
      montantNet = partsAnnee.reduce((s, p) => s + p.montantNet, 0);
    }

    // Upsert
    const existing = await this.docRepo.findByUserEtAnnee(userId, annee);
    const doc = existing ?? new DocumentFiscal();
    doc.userId = userId;
    doc.annee = annee;
    doc.montantBrut = round2(montantBrut);
    doc.montantIR = round2(montantIR);
    doc.montantCSG = round2(montantCSG);
    doc.montantNet = round2(montantNet);
    doc.pdfUrl = null;
    doc.genereeLe = new Date();
    const saved = await this.docRepo.save(doc);

    this.logger.log(
      `IFU généré : user=${userId} annee=${annee} brut=${doc.montantBrut} IR=${doc.montantIR} CSG=${doc.montantCSG}`,
    );
    return saved;
  }
}

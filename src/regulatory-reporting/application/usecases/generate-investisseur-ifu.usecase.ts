import { Inject, Injectable, Logger } from '@nestjs/common';
import { DocumentFiscal } from 'src/regulatory-reporting/domain/document-fiscal';
import {
  DOCUMENT_FISCAL_REPOSITORY,
  type DocumentFiscalRepository,
} from 'src/regulatory-reporting/domain/repositories/document-fiscal.repository';
import {
  DISTRIBUTION_PART_REPOSITORY,
  type DistributionPartRepository,
} from 'src/distributions/applications/ports/repositories/distribution-part.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from 'src/subscription/domain/repositories/investment.repository';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { SyntheseFiscaleAnnuelle } from 'src/regulatory-reporting/domain/value-objects/synthese-fiscale-annuelle';

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

    let synthese = SyntheseFiscaleAnnuelle.vide(annee);

    if (confirmes.length > 0) {
      const invIds = confirmes.map((i) => i.id);
      const parts = await this.partRepo.findByInvestissementIds(invIds);
      const partsAnnee = parts.filter((p) =>
        versementDeLAnnee(p.payeLe, annee),
      );

      // Le net vient de la colonne : c'est ce qui a été crédité, et il fait
      // foi — ce contexte agrège, il ne recalcule pas (§3.3).
      synthese = SyntheseFiscaleAnnuelle.cumuler(
        annee,
        partsAnnee.map((p) => ({
          brut: p.montantBrut,
          prelevementIR: p.prelevementIR,
          prelevementCSG: p.prelevementCSG,
          net: p.montantNet,
        })),
      );
    }

    // Upsert
    const existing = await this.docRepo.findByUserEtAnnee(userId, annee);
    const doc = existing ?? new DocumentFiscal();
    doc.userId = userId;
    doc.annee = annee;
    doc.montantBrut = synthese.montantBrut;
    doc.montantIR = synthese.montantIR;
    doc.montantCSG = synthese.montantCSG;
    doc.montantNet = synthese.montantNet;
    doc.pdfUrl = null;
    doc.genereeLe = new Date();
    const saved = await this.docRepo.save(doc);

    this.logger.log(
      `IFU généré : user=${userId} annee=${annee} brut=${doc.montantBrut} IR=${doc.montantIR} CSG=${doc.montantCSG}`,
    );
    return saved;
  }
}

/** Le versement tombe-t-il dans l'année civile visée ? */
const versementDeLAnnee = (
  payeLe: Date | string | null,
  annee: number,
): boolean => {
  if (!payeLe) return false;
  const date = payeLe instanceof Date ? payeLe : new Date(payeLe);
  return date.getUTCFullYear() === annee;
};

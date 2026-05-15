import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EcheanceEntity } from '../infrastructure/persistences/entities/echeance.entity';
import { InvestmentEntity } from '../infrastructure/persistences/entities/investment.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { EcheanceStatus } from '../domains/enums/investment-status.enum';
import { CloudStorageService } from 'src/common/cloud-storage/cloud-storage.service';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { DocumentType, DocumentRelatedTo } from 'src/documents/domains/enums/document-type.enum';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import PDFDocument from 'pdfkit';

interface IfuAggregate {
  userId: number;
  user: UserEntity;
  totalInterets: number;
  totalIR: number;
  totalCSG: number;
  nbEcheances: number;
}

@Injectable()
export class IfuGenerationService {
  private readonly logger = new Logger(IfuGenerationService.name);

  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    private readonly cloudStorage: CloudStorageService,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  /** Cron annuel : 1er février à 09:00 — génère les IFU de l'année précédente. */
  @Cron('0 9 1 2 *')
  async generateAnnualIfus(): Promise<void> {
    const year = new Date().getFullYear() - 1;
    this.logger.log(`Generating IFU PDFs for year ${year}...`);
    const aggregates = await this.aggregateByUser(year);
    for (const agg of aggregates) {
      await this.generateAndStoreIfu(agg, year);
    }
    this.logger.log(`Generated ${aggregates.length} IFU PDFs for year ${year}`);
  }

  /** Manual trigger (admin endpoint can call this). */
  async generateForYear(year: number): Promise<{ generated: number }> {
    const aggregates = await this.aggregateByUser(year);
    for (const agg of aggregates) {
      await this.generateAndStoreIfu(agg, year);
    }
    return { generated: aggregates.length };
  }

  private async aggregateByUser(year: number): Promise<IfuAggregate[]> {
    const start = new Date(`${year}-01-01T00:00:00Z`);
    const end = new Date(`${year + 1}-01-01T00:00:00Z`);
    const rows = await this.echeanceRepo
      .createQueryBuilder('e')
      .innerJoinAndMapOne('e.investissement', InvestmentEntity, 'inv', 'inv.id = e.investissementId')
      .innerJoinAndMapOne('inv.utilisateur', UserEntity, 'u', 'u.userId = inv.utilisateurId')
      .leftJoinAndMapOne('u.userEmail', 'user_email', 'ue', 'ue.userId = u.userId')
      .where('e.statut = :statut', { statut: EcheanceStatus.PAYE })
      .andWhere('e.payeLe >= :start AND e.payeLe < :end', { start, end })
      .getMany();

    const map = new Map<number, IfuAggregate>();
    for (const e of rows) {
      const inv = (e as any).investissement;
      const user = inv?.utilisateur;
      if (!user) continue;
      const existing = map.get(user.userId) ?? {
        userId: user.userId,
        user,
        totalInterets: 0,
        totalIR: 0,
        totalCSG: 0,
        nbEcheances: 0,
      };
      existing.totalInterets += Number(e.montantInterets ?? 0);
      existing.totalIR += Number(e.prelevementIR ?? 0);
      existing.totalCSG += Number(e.prelevementCSG ?? 0);
      existing.nbEcheances += 1;
      map.set(user.userId, existing);
    }
    return Array.from(map.values());
  }

  private async generateAndStoreIfu(agg: IfuAggregate, year: number): Promise<void> {
    const pdfBuffer = await this.buildIfuPdf(agg, year);
    const filename = `ifu_${year}_${agg.userId}.pdf`;
    const { objectName, publicUrl } = await this.cloudStorage.upload(
      pdfBuffer,
      filename,
      'application/pdf',
      'ifu',
    );

    const doc = this.documentRepo.create({
      type: DocumentType.IFU_ANNUEL,
      relatedTo: DocumentRelatedTo.USER,
      userId: agg.userId,
      projectId: null,
      investmentId: null,
      originalName: filename,
      filename: objectName,
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.length,
      path: publicUrl,
      isPublic: false,
      uploadedBy: agg.userId,
      estPrincipale: false,
    });
    await this.documentRepo.save(doc);

    try {
      await this.notificationEvents.ifuGenerated(agg.userId, year, doc.id);
    } catch (err) {
      this.logger.warn(`IFU notification failed for user ${agg.userId}: ${(err as Error)?.message}`);
    }
  }

  private buildIfuPdf(agg: IfuAggregate, year: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Imprimé Fiscal Unique (IFU)', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Année fiscale : ${year}`, { align: 'center' });
      doc.moveDown(2);

      const name =
        [agg.user.firstname, agg.user.lastname].filter(Boolean).join(' ') ||
        `Utilisateur #${agg.userId}`;
      const email = (agg.user as any).userEmail?.email ?? '';
      doc.fontSize(11).text(`Bénéficiaire : ${name}`);
      doc.text(`Email : ${email}`);
      doc.text(`Identifiant : ${agg.userId}`);
      doc.moveDown();

      doc.fontSize(14).text('Récapitulatif fiscal', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      doc.text(`Nombre d'échéances perçues : ${agg.nbEcheances}`);
      doc.text(`Total intérêts bruts perçus : ${agg.totalInterets.toFixed(2)} XOF`);
      doc.text(`Prélèvement à la source — IR (12,8 %) : ${agg.totalIR.toFixed(2)} XOF`);
      doc.text(`Prélèvement à la source — CSG/CRDS (17,2 %) : ${agg.totalCSG.toFixed(2)} XOF`);
      doc.text(
        `Intérêts nets crédités : ${(agg.totalInterets - agg.totalIR - agg.totalCSG).toFixed(2)} XOF`,
      );
      doc.moveDown(2);

      doc.fontSize(9).fillColor('gray').text(
        "Ce document est généré automatiquement par BeOwn. Les montants indiqués correspondent aux versements effectivement réalisés sur votre compte au cours de l'année fiscale ci-dessus. Pour toute question, contactez support@beown.fr.",
        { align: 'justify' },
      );
      doc.end();
    });
  }
}

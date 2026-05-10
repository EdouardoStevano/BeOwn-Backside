import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Investment } from 'src/investments/domains/investment';

export interface ContractData {
  investment: Investment;
  projectTitle: string;
  projectVille: string;
  projectPays: string;
  investorFirstname: string;
  investorLastname: string;
  investorEmail: string;
  triCible: number;
  dureeMois: number;
}

@Injectable()
export class ContractGeneratorService {
  async generateBulletin(data: ContractData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const primary = '#1A2E35';
      const accent = '#FFB52E';
      const light = '#F8FAFC';
      const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
      const ref = `BEOWN-${data.investment.id.slice(0, 8).toUpperCase()}`;

      // ── Header ──────────────────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 90).fill(primary);
      doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text('BeOwn', 50, 30);
      doc.fontSize(9).font('Helvetica').text('Plateforme d\'investissement immobilier fractionné', 50, 56);
      doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text(`Réf : ${ref}`, doc.page.width - 180, 38);
      doc.fillColor('white').fontSize(8).font('Helvetica').text(`Émis le ${date}`, doc.page.width - 180, 54);

      // ── Title ───────────────────────────────────────────────────────────────
      doc.moveDown(4);
      doc.fillColor(primary).fontSize(18).font('Helvetica-Bold')
        .text('Bulletin de Souscription', { align: 'center' });
      doc.fontSize(11).font('Helvetica').fillColor('#64748B')
        .text(`Confirmation d'investissement — ${data.projectTitle}`, { align: 'center' });
      doc.moveDown(1.5);

      // ── Separator ───────────────────────────────────────────────────────────
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor(accent).lineWidth(2).stroke();
      doc.moveDown(1);

      // ── Section helper ──────────────────────────────────────────────────────
      const section = (title: string) => {
        doc.rect(50, doc.y, doc.page.width - 100, 24).fill(light);
        doc.fillColor(primary).fontSize(10).font('Helvetica-Bold')
          .text(title, 58, doc.y - 17);
        doc.moveDown(0.3);
      };

      const row = (label: string, value: string) => {
        const y = doc.y;
        doc.fillColor('#64748B').fontSize(9).font('Helvetica').text(label, 58, y, { width: 200 });
        doc.fillColor(primary).fontSize(9).font('Helvetica-Bold').text(value, 270, y);
        doc.moveDown(0.6);
      };

      // ── Investor info ────────────────────────────────────────────────────────
      section('INFORMATIONS INVESTISSEUR');
      doc.moveDown(0.5);
      row('Nom complet', `${data.investorFirstname} ${data.investorLastname}`);
      row('Email', data.investorEmail);
      row('ID Investisseur', `#${data.investment.utilisateurId}`);
      doc.moveDown(0.5);

      // ── Project info ─────────────────────────────────────────────────────────
      section('PROJET IMMOBILIER');
      doc.moveDown(0.5);
      row('Nom du projet', data.projectTitle);
      row('Localisation', `${data.projectVille}, ${data.projectPays}`);
      row('Durée', `${data.dureeMois} mois`);
      row('TRI cible', `${data.triCible}% annuel`);
      doc.moveDown(0.5);

      // ── Investment details ────────────────────────────────────────────────────
      section('DÉTAILS DE LA SOUSCRIPTION');
      doc.moveDown(0.5);
      row('Référence', ref);
      row('Date de souscription', date);
      row('Nombre de parts', `${data.investment.nbTitres ?? 1} part(s)`);
      row('Valeur par part', `${Number(data.investment.valeurTitre ?? 0).toLocaleString('fr-FR')} XOF`);

      // Amount highlight box
      doc.moveDown(0.5);
      doc.rect(50, doc.y, doc.page.width - 100, 40).fill(primary);
      doc.fillColor(accent).fontSize(11).font('Helvetica-Bold')
        .text('MONTANT TOTAL SOUSCRIT', 58, doc.y - 30, { width: 200 });
      doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
        .text(`${Number(data.investment.montant).toLocaleString('fr-FR')} XOF`, 280, doc.y - 32);
      doc.moveDown(1.5);

      // ── Legal notice ─────────────────────────────────────────────────────────
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#E2E8F0').lineWidth(1).stroke();
      doc.moveDown(0.8);
      doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
        .text(
          'Ce bulletin de souscription confirme votre investissement sur la plateforme BeOwn. ' +
          'Conformément à la réglementation PSFP, cet investissement est soumis à des risques de perte en capital. ' +
          'Les performances passées ne préjugent pas des performances futures. ' +
          'BeOwn est enregistrée en tant que Prestataire de Services de Financement Participatif.',
          50, doc.y, { width: doc.page.width - 100, align: 'justify' }
        );

      // ── Footer ───────────────────────────────────────────────────────────────
      const footerY = doc.page.height - 50;
      doc.rect(0, footerY - 10, doc.page.width, 60).fill('#F1F5F9');
      doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
        .text('BeOwn SAS — contact@beown.com — www.beown.com', 50, footerY, { align: 'center', width: doc.page.width - 100 });
      doc.text(`Document généré automatiquement le ${date} — ${ref}`, 50, footerY + 12, { align: 'center', width: doc.page.width - 100 });

      doc.end();
    });
  }
}

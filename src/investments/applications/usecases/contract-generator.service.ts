import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Investment } from 'src/investments/domains/investment';
import { formatEur } from 'src/shared/money/format-eur';

export interface ContratRachatData {
  ordreId: string;
  acheteurFirstname: string;
  acheteurLastname: string;
  acheteurEmail: string;
  vendeurId: number;
  projectTitle: string;
  projectVille: string;
  projectPays: string;
  nbFractions: number;
  prixUnitaire: number;
  montantTotal: number;
  triCible: number;
  dureeMois: number;
}

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
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Palette ──
      const NAVY = '#1A2E35';
      const AMBER = '#FFB52E';
      const LIGHT = '#F8FAFC';
      const BORDER = '#E2E8F0';
      const MUTED = '#64748B';
      const FAINT = '#94A3B8';

      const W = doc.page.width;
      const H = doc.page.height;
      const M = 50; // page margin
      const innerW = W - M * 2;

      const date = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      const time = new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const ref = `BEOWN-${data.investment.id.slice(0, 8).toUpperCase()}`;

      // ── Header band ──
      doc.rect(0, 0, W, 100).fill(NAVY);
      doc.rect(0, 100, W, 4).fill(AMBER);

      // Brand
      doc
        .fillColor('white')
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('BeOwn', M, 30);
      doc
        .fillColor('#CBD5E1')
        .fontSize(9)
        .font('Helvetica')
        .text("Plateforme d'investissement immobilier fractionné", M, 60);

      // Ref + date (right)
      doc
        .fillColor(AMBER)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(`Réf. ${ref}`, W - M - 200, 32, { width: 200, align: 'right' });
      doc
        .fillColor('#CBD5E1')
        .fontSize(8)
        .font('Helvetica')
        .text(`Émis le ${date} à ${time}`, W - M - 200, 50, {
          width: 200,
          align: 'right',
        });

      // ── Title block ──
      let y = 132;
      doc
        .fillColor(NAVY)
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('Bulletin de Souscription', M, y, {
          width: innerW,
          align: 'center',
        });
      y += 30;
      doc
        .fillColor(MUTED)
        .fontSize(11)
        .font('Helvetica')
        .text(
          `Confirmation officielle de votre investissement — ${data.projectTitle}`,
          M,
          y,
          { width: innerW, align: 'center' },
        );
      y += 26;

      // ── Highlight card (amount + fractions) ──
      const cardH = 70;
      doc.roundedRect(M, y, innerW, cardH, 6).fill(NAVY);

      doc
        .fillColor(AMBER)
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('MONTANT TOTAL SOUSCRIT', M + 20, y + 14);
      doc
        .fillColor('white')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(
          formatEur(Number(data.investment.montant)),
          M + 20,
          y + 28,
        );

      const fractionsLabelX = M + innerW / 2 + 10;
      doc
        .fillColor(AMBER)
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('FRACTIONS DÉTENUES', fractionsLabelX, y + 14);
      doc
        .fillColor('white')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(
          `${data.investment.nbTitres ?? 1} part${(data.investment.nbTitres ?? 1) > 1 ? 's' : ''}`,
          fractionsLabelX,
          y + 28,
        );

      y += cardH + 24;

      // ── Section + row helpers ──
      const section = (title: string) => {
        const startY = y;
        doc.rect(M, startY, innerW, 22).fill(LIGHT);
        doc.rect(M, startY, 3, 22).fill(AMBER);
        doc
          .fillColor(NAVY)
          .fontSize(9.5)
          .font('Helvetica-Bold')
          .text(title, M + 12, startY + 6.5);
        y = startY + 22 + 10;
      };

      const row = (label: string, value: string) => {
        const startY = y;
        doc
          .fillColor(MUTED)
          .fontSize(9)
          .font('Helvetica')
          .text(label, M + 12, startY, { width: 200 });
        doc
          .fillColor(NAVY)
          .fontSize(9.5)
          .font('Helvetica-Bold')
          .text(value, M + 220, startY, { width: innerW - 232, align: 'left' });
        // Separator line under row
        doc
          .moveTo(M + 12, startY + 16)
          .lineTo(W - M - 12, startY + 16)
          .strokeColor('#F1F5F9')
          .lineWidth(0.5)
          .stroke();
        y = startY + 22;
      };

      // ── Investor section ──
      section('INFORMATIONS INVESTISSEUR');
      row(
        'Nom complet',
        `${data.investorFirstname} ${data.investorLastname}`.trim() || '—',
      );
      row('Email', data.investorEmail || '—');
      row('Identifiant', `#${data.investment.utilisateurId}`);
      y += 6;

      // ── Project section ──
      section('PROJET IMMOBILIER');
      row('Nom du projet', data.projectTitle);
      row('Localisation', `${data.projectVille || '—'}, ${data.projectPays}`);
      row('Durée prévisionnelle', `${data.dureeMois} mois`);
      row('TRI cible annuel', `${data.triCible}%`);
      row('Instrument', data.investment.instrument ?? '—');
      y += 6;

      // ── Subscription details ──
      section('DÉTAILS DE LA SOUSCRIPTION');
      row('Référence', ref);
      row('Date de souscription', date);
      row('Nombre de fractions', `${data.investment.nbTitres ?? 1}`);
      row(
        'Valeur par fraction',
        formatEur(Number(data.investment.valeurTitre ?? 0)),
      );
      row(
        'Montant total',
        formatEur(Number(data.investment.montant)),
      );
      row('Statut', String(data.investment.statut ?? '—').toUpperCase());
      y += 14;

      // ── Legal notice ──
      doc
        .moveTo(M, y)
        .lineTo(W - M, y)
        .strokeColor(BORDER)
        .lineWidth(0.8)
        .stroke();
      y += 10;
      doc
        .fillColor(FAINT)
        .fontSize(7.5)
        .font('Helvetica')
        .text(
          'Ce bulletin de souscription confirme votre investissement sur la plateforme BeOwn. ' +
            'Il remplace toute version précédente émise pour ce même investissement. ' +
            'Cet investissement est soumis à un risque de perte partielle ou totale du capital. ' +
            'Les performances passées ne préjugent pas des performances futures. ' +
            "BeOwn SAS ne détient aucun agrément d'autorité de marché et n'est soumise à la supervision d'aucune d'entre elles.",
          M,
          y,
          { width: innerW, align: 'justify', lineGap: 2 },
        );

      // ── Footer ──
      const footerY = H - 40;
      doc.rect(0, footerY - 14, W, 54).fill('#F1F5F9');
      doc
        .fillColor(FAINT)
        .fontSize(7.5)
        .font('Helvetica')
        .text('BeOwn SAS — contact@beown.fr — www.beown.fr', 0, footerY - 6, {
          width: W,
          align: 'center',
        });
      doc
        .fillColor(FAINT)
        .fontSize(7)
        .font('Helvetica')
        .text(
          `Document généré automatiquement le ${date} à ${time} — ${ref}`,
          0,
          footerY + 6,
          { width: W, align: 'center' },
        );

      doc.end();
    });
  }

  async generateContratSouscription(data: ContractData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const primary = '#1A2E35';
      const accent = '#FFB52E';
      const light = '#F8FAFC';
      const date = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      const ref = `CS-${data.investment.id.slice(0, 8).toUpperCase()}`;

      doc.rect(0, 0, doc.page.width, 90).fill(primary);
      doc
        .fillColor('white')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('BeOwn', 50, 30);
      doc
        .fontSize(9)
        .font('Helvetica')
        .text("Plateforme d'investissement immobilier fractionné", 50, 56);
      doc
        .fillColor(accent)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(`Réf : ${ref}`, doc.page.width - 180, 38);
      doc
        .fillColor('white')
        .fontSize(8)
        .font('Helvetica')
        .text(`Émis le ${date}`, doc.page.width - 180, 54);

      doc.moveDown(4);
      doc
        .fillColor(primary)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('Contrat de Souscription', { align: 'center' });
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#64748B')
        .text(`Investissement immobilier — ${data.projectTitle}`, {
          align: 'center',
        });
      doc.moveDown(1.5);
      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor(accent)
        .lineWidth(2)
        .stroke();
      doc.moveDown(1);

      const section = (title: string) => {
        doc.rect(50, doc.y, doc.page.width - 100, 24).fill(light);
        doc
          .fillColor(primary)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(title, 58, doc.y - 17);
        doc.moveDown(0.3);
      };
      const row = (label: string, value: string) => {
        const y = doc.y;
        doc
          .fillColor('#64748B')
          .fontSize(9)
          .font('Helvetica')
          .text(label, 58, y, { width: 200 });
        doc
          .fillColor(primary)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(value, 270, y);
        doc.moveDown(0.6);
      };

      section('SOUSCRIPTEUR');
      doc.moveDown(0.5);
      row('Nom complet', `${data.investorFirstname} ${data.investorLastname}`);
      row('Email', data.investorEmail);
      row('ID Investisseur', `#${data.investment.utilisateurId}`);
      doc.moveDown(0.5);

      section('PROJET IMMOBILIER');
      doc.moveDown(0.5);
      row('Nom du projet', data.projectTitle);
      row('Localisation', `${data.projectVille}, ${data.projectPays}`);
      row('Durée', `${data.dureeMois} mois`);
      row('TRI cible', `${data.triCible}% annuel`);
      doc.moveDown(0.5);

      section('DÉTAILS DE LA SOUSCRIPTION');
      doc.moveDown(0.5);
      row('Référence', ref);
      row('Date', date);
      row('Nombre de parts', `${data.investment.nbTitres ?? 1} part(s)`);
      row(
        'Valeur par part',
        formatEur(Number(data.investment.valeurTitre ?? 0)),
      );
      doc.moveDown(0.5);
      doc.rect(50, doc.y, doc.page.width - 100, 40).fill(primary);
      doc
        .fillColor(accent)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('MONTANT TOTAL', 58, doc.y - 30, { width: 200 });
      doc
        .fillColor('white')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(
          formatEur(Number(data.investment.montant)),
          280,
          doc.y - 32,
        );
      doc.moveDown(2);

      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor('#E2E8F0')
        .lineWidth(1)
        .stroke();
      doc.moveDown(1);
      doc
        .fillColor(primary)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('SIGNATURE DU SOUSCRIPTEUR', 50);
      doc.moveDown(0.5);
      doc
        .fillColor('#64748B')
        .fontSize(8)
        .font('Helvetica')
        .text(
          "En signant ce contrat, le souscripteur reconnaît avoir pris connaissance des conditions d'investissement et accepte les termes du présent contrat de souscription.",
          50,
          doc.y,
          { width: doc.page.width - 100 },
        );
      doc.moveDown(1.5);
      doc.rect(50, doc.y, 200, 60).strokeColor('#CBD5E1').lineWidth(1).stroke();
      doc
        .fillColor('#94A3B8')
        .fontSize(8)
        .text('Signature', 58, doc.y + 4);
      doc.moveDown(2.5);

      doc
        .fillColor('#94A3B8')
        .fontSize(7.5)
        .font('Helvetica')
        .text(
          "Investir comporte des risques incluant la perte partielle ou totale du capital. BeOwn ne détient aucun agrément d'autorité de marché et n'est soumise à la supervision d'aucune d'entre elles.",
          50,
          doc.y,
          { width: doc.page.width - 100, align: 'justify' },
        );

      const footerY = doc.page.height - 50;
      doc.rect(0, footerY - 10, doc.page.width, 60).fill('#F1F5F9');
      doc
        .fillColor('#94A3B8')
        .fontSize(7.5)
        .font('Helvetica')
        .text('BeOwn SAS — contact@beown.fr — www.beown.fr', 50, footerY, {
          align: 'center',
          width: doc.page.width - 100,
        });
      doc.text(
        `Document généré automatiquement le ${date} — ${ref}`,
        50,
        footerY + 12,
        { align: 'center', width: doc.page.width - 100 },
      );

      doc.end();
    });
  }

  async generateContratRachat(data: ContratRachatData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const primary = '#1A2E35';
      const accent = '#FFB52E';
      const light = '#F8FAFC';
      const date = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      const ref = `RACHAT-${data.ordreId.slice(0, 8).toUpperCase()}`;

      // ── Header ──────────────────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 90).fill(primary);
      doc
        .fillColor('white')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('BeOwn', 50, 30);
      doc
        .fontSize(9)
        .font('Helvetica')
        .text("Plateforme d'investissement immobilier fractionné", 50, 56);
      doc
        .fillColor(accent)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(`Réf : ${ref}`, doc.page.width - 180, 38);
      doc
        .fillColor('white')
        .fontSize(8)
        .font('Helvetica')
        .text(`Émis le ${date}`, doc.page.width - 180, 54);

      // ── Title ───────────────────────────────────────────────────────────────
      doc.moveDown(4);
      doc
        .fillColor(primary)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('Contrat de Rachat — Marché Secondaire', { align: 'center' });
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#64748B')
        .text(`Cession de fractions — ${data.projectTitle}`, {
          align: 'center',
        });
      doc.moveDown(1.5);

      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor(accent)
        .lineWidth(2)
        .stroke();
      doc.moveDown(1);

      const section = (title: string) => {
        doc.rect(50, doc.y, doc.page.width - 100, 24).fill(light);
        doc
          .fillColor(primary)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(title, 58, doc.y - 17);
        doc.moveDown(0.3);
      };

      const row = (label: string, value: string) => {
        const y = doc.y;
        doc
          .fillColor('#64748B')
          .fontSize(9)
          .font('Helvetica')
          .text(label, 58, y, { width: 200 });
        doc
          .fillColor(primary)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(value, 270, y);
        doc.moveDown(0.6);
      };

      // ── Acheteur ────────────────────────────────────────────────────────────
      section('ACHETEUR');
      doc.moveDown(0.5);
      row('Nom complet', `${data.acheteurFirstname} ${data.acheteurLastname}`);
      row('Email', data.acheteurEmail);
      doc.moveDown(0.5);

      // ── Vendeur ──────────────────────────────────────────────────────────────
      section('VENDEUR');
      doc.moveDown(0.5);
      row('Référence vendeur', `#${data.vendeurId}`);
      doc.moveDown(0.5);

      // ── Projet ────────────────────────────────────────────────────────────────
      section('PROJET IMMOBILIER');
      doc.moveDown(0.5);
      row('Nom du projet', data.projectTitle);
      row('Localisation', `${data.projectVille}, ${data.projectPays}`);
      row('Durée', `${data.dureeMois} mois`);
      row('TRI cible', `${data.triCible}% annuel`);
      doc.moveDown(0.5);

      // ── Détails cession ──────────────────────────────────────────────────────
      section('DÉTAILS DE LA CESSION');
      doc.moveDown(0.5);
      row('Référence ordre', ref);
      row('Date de cession', date);
      row('Fractions cédées', `${data.nbFractions} fraction(s)`);
      row(
        'Prix par fraction',
        formatEur(Number(data.prixUnitaire)),
      );

      doc.moveDown(0.5);
      doc.rect(50, doc.y, doc.page.width - 100, 40).fill(primary);
      doc
        .fillColor(accent)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('MONTANT TOTAL DE LA CESSION', 58, doc.y - 30, { width: 200 });
      doc
        .fillColor('white')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(
          formatEur(Number(data.montantTotal)),
          280,
          doc.y - 32,
        );
      doc.moveDown(2);

      // ── Zone de signature ────────────────────────────────────────────────────
      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor('#E2E8F0')
        .lineWidth(1)
        .stroke();
      doc.moveDown(1);
      doc
        .fillColor(primary)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text("SIGNATURE DE L'ACHETEUR", 50);
      doc.moveDown(0.5);
      doc
        .fillColor('#64748B')
        .fontSize(8)
        .font('Helvetica')
        .text(
          "En signant ce document, l'acheteur reconnaît avoir pris connaissance des conditions de cession et accepte les termes du présent contrat.",
          50,
          doc.y,
          { width: doc.page.width - 100 },
        );
      doc.moveDown(1.5);
      doc.rect(50, doc.y, 200, 60).strokeColor('#CBD5E1').lineWidth(1).stroke();
      doc
        .fillColor('#94A3B8')
        .fontSize(8)
        .text('Signature', 58, doc.y + 4);
      doc.moveDown(2);

      // ── Legal ────────────────────────────────────────────────────────────────
      doc
        .fillColor('#94A3B8')
        .fontSize(7.5)
        .font('Helvetica')
        .text(
          "BeOwn ne détient aucun agrément d'autorité de marché et n'est soumise à la supervision d'aucune d'entre elles. " +
            'Les investissements immobiliers sont soumis à des risques de perte en capital.',
          50,
          doc.y,
          { width: doc.page.width - 100, align: 'justify' },
        );

      // ── Footer ───────────────────────────────────────────────────────────────
      const footerY = doc.page.height - 50;
      doc.rect(0, footerY - 10, doc.page.width, 60).fill('#F1F5F9');
      doc
        .fillColor('#94A3B8')
        .fontSize(7.5)
        .font('Helvetica')
        .text('BeOwn SAS — contact@beown.fr — www.beown.fr', 50, footerY, {
          align: 'center',
          width: doc.page.width - 100,
        });
      doc.text(
        `Document généré automatiquement le ${date} — ${ref}`,
        50,
        footerY + 12,
        { align: 'center', width: doc.page.width - 100 },
      );

      doc.end();
    });
  }
}

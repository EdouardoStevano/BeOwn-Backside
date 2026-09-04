import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface CertificatAcceptationData {
  signatureId: string;
  requestId: string;
  signataireFirstname: string;
  signataireLastname: string;
  signataireEmail: string;
  signataireUserId: number;
  documentName: string;
  documentHash: string | null;
  acknowledgedAt: Date;
  acknowledgedIp: string;
}

/**
 * Certificat d'acceptation du parcours de repli « acceptation certifiée ».
 *
 * Texte volontairement SOBRE : le certificat constate un enregistrement
 * d'acceptation horodaté par le serveur de la plateforme et n'affirme RIEN de
 * plus — en particulier aucune conformité à un niveau de signature qualifié du
 * règlement eIDAS. Formulation provisoire : la mission conformité livre le
 * texte définitif (docs/conformite/2026-09-03-baremes-lot2.md, section 3) ;
 * seul le contenu des paragraphes est à substituer, la structure reste.
 */
@Injectable()
export class CertificatAcceptationService {
  async generate(data: CertificatAcceptationData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const NAVY = '#1A2E35';
      const MUTED = '#64748B';
      const BORDER = '#E2E8F0';

      const M = 50;
      const W = doc.page.width;
      const innerW = W - M * 2;

      const horodatageIso = data.acknowledgedAt.toISOString();
      const horodatageFr = data.acknowledgedAt.toLocaleString('fr-FR', {
        dateStyle: 'long',
        timeStyle: 'medium',
        timeZone: 'UTC',
      });

      // ── En-tête ──
      doc.rect(0, 0, W, 90).fill(NAVY);
      doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text('BeOwn', M, 28);
      doc
        .fillColor('#CBD5E1')
        .fontSize(11)
        .font('Helvetica')
        .text("Certificat d'acceptation", M, 58);

      doc.fillColor(NAVY).fontSize(16).font('Helvetica-Bold');
      doc.text("Certificat d'acceptation d'un document", M, 120);

      doc.moveDown(0.8);
      doc.fontSize(10).font('Helvetica').fillColor(NAVY);
      doc.text(
        'La plateforme BeOwn certifie avoir enregistré, dans les conditions ' +
          "décrites ci-dessous, l'acceptation du document identifié par le " +
          'signataire identifié, depuis son espace personnel authentifié.',
        { width: innerW },
      );

      // ── Tableau des éléments de preuve ──
      const lignes: Array<[string, string]> = [
        ['Référence du certificat', `CERT-${data.signatureId.slice(0, 8).toUpperCase()}`],
        ['Demande de signature', data.requestId],
        [
          'Signataire',
          `${data.signataireFirstname} ${data.signataireLastname} (compte n° ${data.signataireUserId})`,
        ],
        ['Adresse e-mail du compte', data.signataireEmail],
        ['Document accepté', data.documentName],
        ['Empreinte SHA-256 du document', data.documentHash ?? 'non calculée'],
        ['Horodatage serveur (UTC)', `${horodatageFr} — ${horodatageIso}`],
        ["Adresse IP à l'acceptation", data.acknowledgedIp],
      ];

      let y = doc.y + 16;
      for (const [label, valeur] of lignes) {
        doc.rect(M, y, innerW, 34).strokeColor(BORDER).lineWidth(0.5).stroke();
        doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(label.toUpperCase(), M + 10, y + 6);
        doc
          .fillColor(NAVY)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(valeur, M + 10, y + 17, { width: innerW - 20 });
        y += 34;
      }

      // ── Portée probatoire (texte provisoire — mission conformité) ──
      doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('Portée du certificat', M, y + 24);
      doc
        .fillColor(MUTED)
        .fontSize(9)
        .font('Helvetica')
        .text(
          "Le présent certificat constate l'enregistrement, par les systèmes de la " +
            "plateforme, d'une acceptation exprimée depuis un compte authentifié : " +
            "horodatage par l'horloge du serveur, adresse IP d'origine de la requête " +
            "et empreinte numérique du document présenté. Il constitue un élément de " +
            "preuve de cette acceptation, que chaque partie conserve avec l'exemplaire " +
            'du document accepté.',
          M,
          doc.y + 6,
          { width: innerW },
        );

      // ── Pied ──
      doc
        .fillColor('#94A3B8')
        .fontSize(8)
        .text(
          `Document généré automatiquement par la plateforme BeOwn le ${horodatageFr} (UTC).`,
          M,
          doc.page.height - 70,
          { width: innerW },
        );

      doc.end();
    });
  }
}

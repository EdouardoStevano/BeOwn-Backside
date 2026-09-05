import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import PDFDocument = require('pdfkit');
import { DocumentFiscal } from '../domains/document-fiscal';

export interface InvestorInfo {
  userId: number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  /**
   * Code pays ISO-3166 alpha-2 de la résidence fiscale déclarée
   * (`profil_personne_physique.residenceFiscale`), `null` si non renseignée.
   */
  residenceFiscale?: string | null;
  /**
   * Numéro d'identification fiscale déclaré
   * (`profil_personne_physique.nif`), `null` si non renseigné.
   */
  nif?: string | null;
}

/**
 * Génère un PDF type IFU (Imprimé Fiscal Unique, équivalent simplifié du
 * formulaire 2561 français) à partir d'un DocumentFiscal.
 *
 * Stream le PDF directement sur la Response Express — pas de stockage cloud
 * pour ce MVP. Phase 10 pourra ajouter l'upload + signature électronique.
 *
 * ── Résidence fiscale et NIF : pourquoi ils figurent ici ──────────────────
 *
 * Les deux champs étaient collectés au profil, validés, stockés, exportés…
 * et lus par AUCUN calcul ni AUCUN document : une collecte sans finalité
 * effective, c'est-à-dire un manquement à la minimisation (art. 5.1.c RGPD).
 * Deux issues étaient possibles : cesser de les collecter, ou leur rendre
 * l'usage qui les justifie. C'est la seconde qui a été retenue, parce que cet
 * usage existe et qu'il est réglementaire :
 *
 *  - le récapitulatif fiscal est le document sur lequel le bénéficiaire
 *    s'appuie pour déclarer ses revenus ; pour un bénéficiaire NON-RÉSIDENT,
 *    le pays de résidence fiscale commande le régime applicable (convention
 *    bilatérale, taux de retenue), et le NIF étranger est l'identifiant qui
 *    permet de le rattacher — c'est précisément le couple que l'échange
 *    automatique d'informations (art. 1649 AC CGI, directive 2014/107/UE dite
 *    DAC2 / norme CRS) impose de tenir pour les comptes déclarables ;
 *  - côté français, la déclaration des revenus de capitaux mobiliers
 *    (art. 242 ter CGI, formulaire 2561) identifie le bénéficiaire, et le
 *    numéro fiscal en fiabilise le rapprochement par l'administration.
 *
 * Régime de conservation : ligne 14 du barème (justificatifs fiscaux, 6 ans,
 * art. L. 102 B LPF), absorbée en pratique par les dix ans comptables. Les
 * deux champs sont effacés à l'anonymisation d'un compte sans obligation, et
 * avec le dossier d'identité archivé à clôture + 5 ans sinon.
 *
 * Les deux lignes ne s'impriment QUE si la donnée est renseignée : elles ne
 * sont obligatoires ni l'une ni l'autre au profil, et un IFU d'investisseur
 * résident sans NIF reste parfaitement valide. Un champ vide ne produit pas
 * une ligne vide — il ne produit rien.
 */
@Injectable()
export class IfuPdfService {
  streamToResponse(
    doc: DocumentFiscal,
    investor: InvestorInfo,
    res: Response,
  ): void {
    const filename = `IFU-${doc.annee}-user${doc.userId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );

    const pdf = new PDFDocument({ margin: 48, size: 'A4' });
    pdf.pipe(res);

    // ─── En-tête ────────────────────────────────────────────────────────────
    pdf
      .fontSize(22)
      .fillColor('#1A2E35')
      .text('BeOwn', { continued: true })
      .fillColor('#FFB52E')
      .text(' — Imprimé Fiscal Unique');
    pdf.moveDown(0.2);
    pdf
      .fontSize(10)
      .fillColor('#94a3b8')
      .text(`Récapitulatif des revenus equity-locatif – exercice ${doc.annee}`);
    pdf.moveDown(0.2);
    pdf.text(
      `Document généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    );
    pdf.moveDown(1.5);

    // ─── Bénéficiaire ───────────────────────────────────────────────────────
    pdf.fontSize(11).fillColor('#1A2E35').text('Bénéficiaire', { underline: true });
    pdf.moveDown(0.3);
    const fullName =
      `${investor.firstName ?? ''} ${investor.lastName ?? ''}`.trim() ||
      `User #${investor.userId}`;
    pdf.fontSize(10).fillColor('#0f172a').text(`Nom : ${fullName}`);
    if (investor.email) pdf.text(`Email : ${investor.email}`);
    if (investor.residenceFiscale) {
      pdf.text(`Résidence fiscale : ${investor.residenceFiscale}`);
    }
    if (investor.nif) {
      pdf.text(`Numéro d'identification fiscale : ${investor.nif}`);
    }
    pdf.text(`Identifiant interne : #${doc.userId}`);
    pdf.moveDown(1.2);

    // ─── Récapitulatif fiscal ───────────────────────────────────────────────
    pdf.fontSize(11).fillColor('#1A2E35').text('Récapitulatif fiscal', { underline: true });
    pdf.moveDown(0.5);

    const fmt = (n: number) =>
      new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

    const rows: Array<[string, string, string]> = [
      ['Montant brut perçu', fmt(doc.montantBrut), 'Somme des distributions equity-locatif sur l\'année'],
      ['Prélèvement IR (12,8%)', `−${fmt(doc.montantIR)}`, 'Impôt sur le revenu – Prélèvement Forfaitaire Unique'],
      ['CSG / CRDS (17,2%)', `−${fmt(doc.montantCSG)}`, 'Cotisations sociales'],
      ['Montant net versé', fmt(doc.montantNet), 'Crédité sur le wallet investisseur'],
    ];

    pdf.fontSize(10);
    rows.forEach(([label, value, hint]) => {
      const isTotal = label === 'Montant net versé';
      pdf.fillColor(isTotal ? '#FFB52E' : '#0f172a');
      pdf
        .font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
        .text(`${label} : `, { continued: true })
        .text(value, { continued: false });
      pdf
        .font('Helvetica')
        .fillColor('#94a3b8')
        .fontSize(8)
        .text(hint);
      pdf.fontSize(10);
      pdf.moveDown(0.4);
    });

    pdf.moveDown(1);

    // ─── Mentions légales ───────────────────────────────────────────────────
    pdf.fontSize(11).fillColor('#1A2E35').text('Mentions légales', { underline: true });
    pdf.moveDown(0.3);
    pdf
      .fontSize(8)
      .fillColor('#475569')
      .text(
        'Ce document est fourni à titre informatif. Les montants déclarés correspondent ' +
          'aux distributions equity-locatif effectivement versées au cours de l\'année civile ' +
          `${doc.annee}. Les prélèvements IR et CSG ont été effectués à la source par la plateforme ` +
          'BeOwn et reversés aux administrations compétentes via les comptes séquestres dédiés.',
        { align: 'justify' },
      );
    pdf.moveDown(0.5);
    pdf.text(
      'L\'investisseur reste responsable de la déclaration de ses revenus auprès de l\'administration fiscale. ' +
        'En cas de divergence avec un IFU officiel transmis par voie réglementaire, ce document doit être considéré comme ' +
        'un récapitulatif interne BeOwn.',
      { align: 'justify' },
    );

    pdf.moveDown(2);
    pdf.fontSize(8).fillColor('#94a3b8').text('— BeOwn · Plateforme d\'investissement immobilier equity-locatif —', { align: 'center' });

    pdf.end();
  }
}

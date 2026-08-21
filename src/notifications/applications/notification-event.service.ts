import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationType } from '../infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { formatEur } from 'src/shared/money/format-eur';

@Injectable()
export class NotificationEventService {
  private readonly logger = new Logger(NotificationEventService.name);

  constructor(private readonly notifications: NotificationService) {}

  private displayName(u: {
    firstname?: string | null;
    lastname?: string | null;
    userEmail?: { email?: string } | null;
  }): string {
    const name = [u.firstname, u.lastname].filter(Boolean).join(' ');
    return name || u.userEmail?.email || 'Utilisateur inconnu';
  }

  async kycValidatedByAdmin(userId: number, adminId: number): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.KYC_VALIDE,
        titre: 'Identité vérifiée ✓',
        message:
          'Votre KYC a été validé par notre équipe. Vous pouvez désormais investir.',
        metadata: { adminId },
      });
    } catch (err) {
      this.logger.warn(
        `kycValidatedByAdmin failed: ${(err as Error)?.message}`,
      );
    }
  }

  async kycRejectedByAdmin(
    userId: number,
    motif: string,
    adminId: number,
  ): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.KYC_REJETE,
        titre: 'KYC refusé',
        message: `Votre dossier KYC a été refusé. Motif : ${motif}. Vous pouvez resoumettre vos documents.`,
        metadata: { motif, adminId },
      });
    } catch (err) {
      this.logger.warn(`kycRejectedByAdmin failed: ${(err as Error)?.message}`);
    }
  }

  async accountSuspended(
    userId: number,
    motif: string | null,
    adminId: number,
  ): Promise<void> {
    try {
      const suffix = motif ? `. Motif : ${motif}` : '';
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.COMPTE_SUSPENDU,
        titre: 'Compte suspendu',
        message: `Votre compte a été suspendu par l'équipe BeOwn${suffix}.`,
        metadata: { motif, adminId },
      });
    } catch (err) {
      this.logger.warn(`accountSuspended failed: ${(err as Error)?.message}`);
    }
  }

  async accountReactivated(userId: number, adminId: number): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.COMPTE_REACTIVE,
        titre: 'Compte réactivé ✓',
        message:
          'Votre compte a été réactivé. Vous pouvez à nouveau accéder à la plateforme.',
        metadata: { adminId },
      });
    } catch (err) {
      this.logger.warn(`accountReactivated failed: ${(err as Error)?.message}`);
    }
  }

  async accountClosed(
    userId: number,
    motif: string | null,
    adminId: number,
  ): Promise<void> {
    try {
      const suffix = motif ? `. Motif : ${motif}` : '';
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.COMPTE_CLOS,
        titre: 'Compte clôturé',
        message: `Votre compte a été clôturé par l'équipe BeOwn${suffix}.`,
        metadata: { motif, adminId },
      });
    } catch (err) {
      this.logger.warn(`accountClosed failed: ${(err as Error)?.message}`);
    }
  }

  async profileUpdatedByAdmin(
    userId: number,
    changedFields: string[],
    adminId: number,
  ): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.PROFIL_MODIFIE,
        titre: 'Profil mis à jour',
        message: `Votre profil a été modifié par l'équipe BeOwn (${changedFields.join(', ')}).`,
        metadata: { changedFields, adminId },
      });
    } catch (err) {
      this.logger.warn(
        `profileUpdatedByAdmin failed: ${(err as Error)?.message}`,
      );
    }
  }

  async echeanceUpcoming(echeance: any, project: any): Promise<void> {
    try {
      const userId = echeance.investissement?.utilisateurId;
      if (!userId) return;
      const dateStr = new Date(echeance.datePrevue).toLocaleDateString('fr-FR');
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.ECHEANCE,
        titre: 'Échéance à venir',
        message: `Votre échéance n°${echeance.numero} de ${formatEur(Number(echeance.montantTotal))} pour « ${project.titre} » est prévue le ${dateStr}.`,
        metadata: {
          echeanceId: echeance.id,
          investissementId: echeance.investissementId,
          projetId: project.id,
          numero: echeance.numero,
          montant: Number(echeance.montantTotal),
          datePrevue: echeance.datePrevue,
        },
      });
    } catch (err) {
      this.logger.warn(`echeanceUpcoming failed: ${(err as Error)?.message}`);
    }
  }

  async echeancePaid(echeance: any, project: any): Promise<void> {
    try {
      const userId = echeance.investissement?.utilisateurId;
      if (!userId) return;
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.ECHEANCE,
        titre: 'Échéance payée ✓',
        message: `L'échéance n°${echeance.numero} de ${formatEur(Number(echeance.montantTotal))} pour « ${project.titre} » a été créditée sur votre wallet.`,
        metadata: {
          echeanceId: echeance.id,
          investissementId: echeance.investissementId,
          projetId: project.id,
          numero: echeance.numero,
          montant: Number(echeance.montantTotal),
        },
      });
    } catch (err) {
      this.logger.warn(`echeancePaid failed: ${(err as Error)?.message}`);
    }
  }

  async echeanceOverdueAdmin(echeance: any, project: any): Promise<void> {
    try {
      await this.notifications.pushToRoles({
        type: NotificationType.ECHEANCE,
        titre: 'Échéance en retard',
        message: `L'échéance n°${echeance.numero} de ${formatEur(Number(echeance.montantTotal))} pour "${project.titre}" est en retard.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: {
          echeanceId: echeance.id,
          investissementId: echeance.investissementId,
          projetId: project.id,
          numero: echeance.numero,
          montant: Number(echeance.montantTotal),
        },
      });
    } catch (err) {
      this.logger.warn(
        `echeanceOverdueAdmin failed: ${(err as Error)?.message}`,
      );
    }
  }

  async retraitProcessed(
    userId: number,
    montant: number,
    reference: string,
  ): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.RETRAIT_TRAITE,
        titre: 'Retrait traité ✓',
        message: `Votre retrait de ${formatEur(montant)} a été envoyé vers votre compte bancaire. Référence : ${reference}.`,
        metadata: { montant, reference },
      });
    } catch (err) {
      this.logger.warn(`retraitProcessed failed: ${(err as Error)?.message}`);
    }
  }

  async accountDeletedByUser(user: any): Promise<void> {
    try {
      const email = user.userEmail?.email ?? '';
      await this.notifications.pushToRoles({
        type: NotificationType.COMPTE_SUPPRIME,
        titre: 'Compte supprimé',
        message: `${this.displayName(user)} (${email}) a supprimé son compte (soft-delete).`,
        roles: [UserRole.SUPER_ADMIN, UserRole.COMPLIANCE, UserRole.SUPPORT],
        metadata: { userId: user.userId, email },
      });
    } catch (err) {
      this.logger.warn(
        `accountDeletedByUser failed: ${(err as Error)?.message}`,
      );
    }
  }

  async userRegistered(user: any): Promise<void> {
    try {
      const email = user.userEmail?.email ?? '';
      await this.notifications.pushToRoles({
        type: NotificationType.NOUVELLE_INSCRIPTION,
        titre: 'Nouvelle inscription',
        message: `${this.displayName(user)} (${email}) vient de s'inscrire sur la plateforme.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.SUPPORT],
        metadata: { userId: user.userId, email },
      });
    } catch (err) {
      this.logger.warn(`userRegistered failed: ${(err as Error)?.message}`);
    }
  }

  async secondaryOrderCreated(
    ordre: any,
    project: any,
    vendeur: any,
  ): Promise<void> {
    try {
      await this.notifications.pushToRoles({
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Nouvelle annonce marché secondaire',
        message: `${this.displayName(vendeur)} a mis en vente ${ordre.nbFractions} fraction(s) de "${project.titre}" à ${formatEur(Number(ordre.prixUnitaire))}/fraction.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.COMPLIANCE, UserRole.FINANCIER],
        metadata: {
          ordreId: ordre.id,
          projetId: project.id,
          vendeurId: vendeur.userId,
          nbFractions: ordre.nbFractions,
          prixUnitaire: Number(ordre.prixUnitaire),
        },
      });
    } catch (err) {
      this.logger.warn(
        `secondaryOrderCreated failed: ${(err as Error)?.message}`,
      );
    }
  }

  async investmentCreated(
    investment: any,
    project: any,
    user: any,
  ): Promise<void> {
    const montant = Number(investment.montant);
    const nbFractions = investment.nbTitres ?? 0;
    try {
      await this.notifications.push({
        utilisateurId: investment.utilisateurId,
        type: NotificationType.INVESTISSEMENT,
        titre: 'Investissement confirmé',
        message: `Votre investissement de ${formatEur(montant)} dans "${project.titre}" est confirmé. Vous détenez ${nbFractions} fraction(s).`,
        metadata: {
          investissementId: investment.id,
          projetId: project.id,
          montant,
          nbFractions,
        },
      });
    } catch (err) {
      this.logger.warn(
        `investmentCreated (user) failed: ${(err as Error)?.message}`,
      );
    }
    try {
      await this.notifications.pushToRoles({
        type: NotificationType.INVESTISSEMENT,
        titre: 'Nouvel investissement',
        message: `${this.displayName(user)} a investi ${formatEur(montant)} dans "${project.titre}" (${nbFractions} fraction(s)).`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
        metadata: {
          investissementId: investment.id,
          projetId: project.id,
          userId: investment.utilisateurId,
          montant,
          nbFractions,
        },
      });
    } catch (err) {
      this.logger.warn(
        `investmentCreated (admin) failed: ${(err as Error)?.message}`,
      );
    }
  }

  async fractionsToppedUp(
    investment: any,
    project: any,
    user: any,
    nbFractions: number,
    montantDelta: number,
  ): Promise<void> {
    const totalFractions = investment.nbTitres ?? 0;
    try {
      await this.notifications.push({
        utilisateurId: investment.utilisateurId,
        type: NotificationType.INVESTISSEMENT,
        titre: 'Fractions ajoutées',
        message: `+${nbFractions} fraction${nbFractions > 1 ? 's' : ''} ajoutée${nbFractions > 1 ? 's' : ''} dans "${project.titre}". Vous détenez désormais ${totalFractions} fraction(s) (${formatEur(montantDelta)} débités).`,
        metadata: {
          investissementId: investment.id,
          projetId: project.id,
          nbFractions,
          montantDelta,
          totalFractions,
        },
      });
    } catch (err) {
      this.logger.warn(
        `fractionsToppedUp (user) failed: ${(err as Error)?.message}`,
      );
    }
    try {
      await this.notifications.pushToRoles({
        type: NotificationType.INVESTISSEMENT,
        titre: 'Top-up investissement',
        message: `${this.displayName(user)} a ajouté ${nbFractions} fraction(s) dans "${project.titre}" (+${formatEur(montantDelta)}).`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: {
          investissementId: investment.id,
          projetId: project.id,
          userId: investment.utilisateurId,
          nbFractions,
          montantDelta,
        },
      });
    } catch (err) {
      this.logger.warn(
        `fractionsToppedUp (admin) failed: ${(err as Error)?.message}`,
      );
    }
  }

  async ifuGenerated(
    userId: number,
    year: number,
    documentId: string,
  ): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.AUTRE,
        titre: `Votre IFU ${year} est disponible`,
        message: `Votre Imprimé Fiscal Unique pour l'année ${year} est disponible dans vos documents.`,
        metadata: { documentId, year },
      });
    } catch (err) {
      this.logger.warn(`ifuGenerated failed: ${(err as Error)?.message}`);
    }
  }

  async secondaryTradeExecuted(
    ordre: any,
    project: any,
    buyer: any,
    seller: any,
    nbFractions: number,
  ): Promise<void> {
    const prix = Number(ordre.prixUnitaire);
    const meta = {
      ordreId: ordre.id,
      projetId: project.id,
      buyerId: buyer.userId,
      sellerId: seller.userId,
      nbFractions,
      prixUnitaire: prix,
    };
    try {
      await this.notifications.push({
        utilisateurId: buyer.userId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Achat de fractions confirmé',
        message: `Vous avez acheté ${nbFractions} fraction(s) à ${formatEur(prix)}/fraction pour "${project.titre}".`,
        metadata: meta,
      });
    } catch (err) {
      this.logger.warn(
        `secondaryTradeExecuted (buyer) failed: ${(err as Error)?.message}`,
      );
    }
    try {
      await this.notifications.push({
        utilisateurId: seller.userId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Vente de fractions exécutée',
        message: `${nbFractions} fraction(s) de votre ordre ont été achetées à ${formatEur(prix)}/fraction.`,
        metadata: meta,
      });
    } catch (err) {
      this.logger.warn(
        `secondaryTradeExecuted (seller) failed: ${(err as Error)?.message}`,
      );
    }
    try {
      await this.notifications.pushToRoles({
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Trade marché secondaire',
        message: `${this.displayName(buyer)} a acheté ${nbFractions} fraction(s) à ${this.displayName(seller)} pour "${project.titre}".`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
        metadata: meta,
      });
    } catch (err) {
      this.logger.warn(
        `secondaryTradeExecuted (admin) failed: ${(err as Error)?.message}`,
      );
    }
  }
}

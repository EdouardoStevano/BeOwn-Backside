import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { EcheanceOrmMapper } from 'src/servicing/infrastructure/persistence/mappers/echeance.orm-mapper';
import { EcheanceStatus } from 'src/servicing/domain/enums/echeance.enum';
import { AucunInvestissementSurLeProjetError } from 'src/servicing/domain/errors';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domain/enums/user.enum';

/**
 * **Vérifier un numéro d'échéance** — la finance a contrôlé l'échéance N d'un
 * projet : toutes les lignes de ce numéro, chez tous les investisseurs,
 * deviennent payables automatiquement par le CRON à leur date.
 *
 * Le use case orchestre, il ne décide pas (§14). La transition
 * `A_VENIR → EN_ATTENTE_PAIEMENT` appartient à `Echeance.verifier()` ; elle
 * était posée par un `update` de colonne au milieu de
 * `AdminEcheancesController`, sans qu'aucun code ne dise qu'on ne vérifie
 * qu'une échéance encore à venir.
 *
 * **La sélection reste filtrée sur `A_VENIR`, et c'est délibéré.** Le geste est
 * un lot : vérifier le numéro 3 d'un projet de quarante investisseurs ne doit
 * pas échouer parce que l'un d'eux a déjà été réglé à part. Les lignes déjà
 * engagées sont ignorées, comme avant ; le domaine garde le dernier mot sur
 * chacune de celles qu'on touche.
 */
@Injectable()
export class VerifierEcheanceProjetUseCase {
  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echeances: Repository<EcheanceEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investissements: Repository<InvestmentEntity>,
    private readonly notifications: NotificationService,
  ) {}

  /** Rend le numéro payable automatiquement. */
  async verifier(
    projetId: string,
    numero: number,
    parAdminId: number,
  ): Promise<{ verified: number }> {
    const lignes = await this.lignesDuNumero(
      projetId,
      numero,
      EcheanceStatus.A_VENIR,
      { exigeDesInvestissements: true },
    );

    for (const ligne of lignes) {
      const echeance = EcheanceOrmMapper.toDomain(ligne);
      echeance.verifier();
      await this.echeances.save(
        EcheanceOrmMapper.appliquerSur(ligne, echeance),
      );
    }

    this.annoncerALaFinance(projetId, numero, lignes.length, parAdminId);
    return { verified: lignes.length };
  }

  /** Revient sur la vérification, tant que le CRON n'a pas payé. */
  async annuler(
    projetId: string,
    numero: number,
  ): Promise<{ reverted: number }> {
    const lignes = await this.lignesDuNumero(
      projetId,
      numero,
      EcheanceStatus.EN_ATTENTE_PAIEMENT,
      { exigeDesInvestissements: false },
    );

    for (const ligne of lignes) {
      const echeance = EcheanceOrmMapper.toDomain(ligne);
      echeance.annulerVerification();
      await this.echeances.save(
        EcheanceOrmMapper.appliquerSur(ligne, echeance),
      );
    }

    return { reverted: lignes.length };
  }

  private async lignesDuNumero(
    projetId: string,
    numero: number,
    statut: EcheanceStatus,
    options: { exigeDesInvestissements: boolean },
  ): Promise<EcheanceEntity[]> {
    const investissements = await this.investissements.find({
      where: { projetId },
    });
    if (investissements.length === 0) {
      if (options.exigeDesInvestissements) {
        throw new AucunInvestissementSurLeProjetError(projetId);
      }
      return [];
    }

    return this.echeances.find({
      where: {
        investissementId: In(investissements.map((i) => i.id)),
        numero,
        statut,
      },
    });
  }

  /** Annonce non bloquante : la vérification est acquise quoi qu'il arrive. */
  private annoncerALaFinance(
    projetId: string,
    numero: number,
    verified: number,
    parAdminId: number,
  ): void {
    this.notifications
      .pushToAdmins({
        type: NotificationType.ECHEANCE,
        titre: `Échéance #${numero} vérifiée`,
        message: `L'échéance ${numero} est vérifiée : elle sera payée automatiquement à sa date (${verified} investisseur(s)).`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: { projectId: projetId, numero, verified, by: parAdminId },
      })
      .catch(() => {});
  }
}

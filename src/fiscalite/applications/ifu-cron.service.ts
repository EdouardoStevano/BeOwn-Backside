import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GenerateInvestisseurIfuUseCase } from './usecases/generate-investisseur-ifu.usecase';
import {
  DISTRIBUTION_PART_REPOSITORY,
  type DistributionPartRepository,
} from 'src/distributions/applications/ports/repositories/distribution-part.repository';

/**
 * Cron annuel : génère les IFU N-1 pour tous les investisseurs ayant eu
 * au moins une distribution versée dans l'année écoulée.
 *
 * Tourne le 15 janvier à 6h.
 */
@Injectable()
export class IfuCronService {
  private readonly logger = new Logger(IfuCronService.name);

  constructor(
    private readonly generateUseCase: GenerateInvestisseurIfuUseCase,
    @Inject(DISTRIBUTION_PART_REPOSITORY)
    private readonly partRepo: DistributionPartRepository,
  ) {}

  // 0 0 6 15 1 * — 15 janvier à 6h00
  @Cron('0 0 6 15 1 *', { name: 'ifu-annual-generation' })
  async annualGeneration(): Promise<void> {
    const annee = new Date().getUTCFullYear() - 1;
    this.logger.log(`Démarrage génération IFU annuelle pour ${annee}`);
    await this.run(annee);
  }

  /**
   * Méthode utilisable directement (sans cron) — utilisée par l'endpoint
   * admin `POST /admin/fiscalite/ifu/generate-all/:annee`.
   *
   * POURQUOI la collecte passe par une requête dédiée : la donnée cherchée est
   * « quels investisseurs ont été PAYÉS sur l'exercice ». C'est une question de
   * base de données — jointure part → investissement, filtre sur payeLe dans
   * l'année, DISTINCT — pas une agrégation en mémoire. L'implémentation
   * précédente chargeait les parts NON payées (`findUnpaid`) puis les filtrait
   * sur `payeLe` : l'ensemble était vide par construction, aucun IFU n'était
   * jamais généré. Elle résolvait en plus un investissement par requête (N+1).
   */
  async run(annee: number): Promise<{
    nbInvestisseurs: number;
    nbSucces: number;
    nbErreurs: number;
    erreurs: Array<{ userId: number; raison: string }>;
  }> {
    const userIds =
      await this.partRepo.findUtilisateurIdsAvecPartPayeeSurAnnee(annee);

    let nbSucces = 0;
    const erreurs: Array<{ userId: number; raison: string }> = [];

    // Un échec de génération est isolé à l'investisseur concerné : le lot
    // annuel doit aller au bout et remonter le détail des cas à rejouer.
    for (const userId of userIds) {
      try {
        await this.generateUseCase.execute(userId, annee);
        nbSucces++;
      } catch (err: any) {
        const raison = err?.message ?? String(err);
        erreurs.push({ userId, raison });
        this.logger.warn(`IFU échoué pour user ${userId}: ${raison}`);
      }
    }

    this.logger.log(
      `Cron IFU terminé : ${nbSucces}/${userIds.length} succès, ${erreurs.length} erreurs.`,
    );
    return {
      nbInvestisseurs: userIds.length,
      nbSucces,
      nbErreurs: erreurs.length,
      erreurs,
    };
  }
}

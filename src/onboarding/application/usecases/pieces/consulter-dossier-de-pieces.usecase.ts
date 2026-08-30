import { Inject, Injectable } from '@nestjs/common';
import {
  DOSSIER_DE_PIECES_REPOSITORY,
  type DossierDePiecesRepository,
} from 'src/onboarding/domain/repositories/dossier-de-pieces.repository';
import {
  BENEFICIAIRES_DE_LA_SOCIETE_QUERY,
  type BeneficiairesDeLaSocieteQuery,
} from '../../ports/beneficiaires-de-la-societe.query';
import {
  VueDossierDePieces,
  vueDossierDePieces,
} from '../../mappers/dossier-de-pieces-vue.mapper';
import { GetProfilPMUseCase } from '../profiles/get-profil-pm.usecase';

/**
 * Où en est le dossier de pièces d'une société : ce qui est déposé, ce qui
 * manque, et pourquoi.
 *
 * C'est l'écran que le titulaire consulte pour savoir quoi faire. Il rend la
 * **raison** de chaque manque — jamais déposée, refusée avec son motif, en
 * attente d'instruction, ou périmée — parce que c'est elle qui dicte le geste
 * suivant, et que sans elle le front devrait la déduire en réappliquant la
 * règle des trois mois du KBIS.
 */
@Injectable()
export class ConsulterDossierDePiecesUseCase {
  constructor(
    @Inject(DOSSIER_DE_PIECES_REPOSITORY)
    private readonly dossiers: DossierDePiecesRepository,
    @Inject(BENEFICIAIRES_DE_LA_SOCIETE_QUERY)
    private readonly beneficiaires: BeneficiairesDeLaSocieteQuery,
    private readonly getProfilPM: GetProfilPMUseCase,
  ) {}

  async execute(
    userId: number,
    societeId: string,
  ): Promise<VueDossierDePieces> {
    await this.getProfilPM.execute(userId, societeId);

    // Les deux lectures sont indépendantes, donc menées de front.
    const [dossier, beneficiaires] = await Promise.all([
      this.dossiers.parSociete(societeId),
      this.beneficiaires.parSociete(societeId),
    ]);

    return vueDossierDePieces(dossier, beneficiaires);
  }
}

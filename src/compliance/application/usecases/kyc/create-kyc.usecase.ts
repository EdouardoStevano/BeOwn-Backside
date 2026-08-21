import { Inject, Injectable } from '@nestjs/common';
import { KycFactory } from 'src/compliance/domain/factories/kyc.factory';
import { Kyc } from 'src/compliance/domain/aggregates/kyc';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/compliance/domain/repositories/kyc.repository';

/**
 * Initialisation du dossier de vérification d'identité.
 *
 * Ce use case n'orchestre plus que des accès (§6 — Application Service) :
 * regarder si le dossier existe, le faire naître sinon, le persister. L'état de
 * départ — statut, niveau de diligence, fournisseur, absence de score et de
 * session — est passé dans `KycFactory.creer` : il vaut pour tout point
 * d'entrée, et non pour la seule route HTTP qui l'écrivait à la main.
 *
 * **Idempotent**, contrairement aux `CreateProfilPP/PM` du contexte Profiles qui
 * refusent un doublon. Ce n'est pas un oubli : ouvrir un dossier n'apporte
 * aucune donnée de l'appelant, donc un second appel ne peut rien écraser, et
 * deux chemins comptent dessus — le front rappelle `POST /kyc/me` à chaque
 * reprise du parcours, et {@link StartKycSessionUseCase} ouvre le dossier au
 * démarrage d'une session Stripe Identity sans savoir s'il existe déjà. Rendre
 * un 409 y obligerait chaque appelant à rattraper l'erreur pour relire le
 * dossier.
 */
@Injectable()
export class CreateKycUseCase {
  constructor(
    @Inject(KYC_REPOSITORY)
    private readonly kycRepository: KycRepository,
  ) {}

  async execute(userId: number): Promise<Kyc> {
    const existant = await this.kycRepository.findByUserId(userId);
    if (existant) return existant;

    return this.kycRepository.save(KycFactory.creer({ utilisateurId: userId }));
  }
}

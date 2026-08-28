import { Inject, Injectable } from '@nestjs/common';
import {
  REGISTRE_DES_BENEFICIAIRES_REPOSITORY,
  type RegistreDesBeneficiairesRepository,
} from 'src/compliance/domain/repositories/registre-des-beneficiaires.repository';
import { ChampsBeneficiaire } from 'src/compliance/domain/entities/beneficiaire-effectif';
import { BeneficiaireEffectifSnapshot } from 'src/compliance/domain/entities/beneficiaire-effectif';
import { GetProfilPMUseCase } from '../profiles/get-profil-pm.usecase';

/**
 * Déclaration d'un bénéficiaire effectif au registre d'une société.
 *
 * Ce use case n'orchestre que des accès (§14) : vérifier que la société est
 * bien celle du demandeur, confier la déclaration au registre, persister. Ce
 * qui décide — le seuil de 25 %, la validité de la nationalité, le plafond des
 * détentions directes — vit dans `BeneficiaireEffectif` et
 * `RegistreDesBeneficiaires`, où cela s'éprouve sans base de données.
 *
 * Ce travail se faisait entièrement dans `BeneficiaireEffectifController`, qui
 * injectait `Repository<BeneficiaireEffectifEntity>` et appelait `create` puis
 * `save` : les seules règles écrites vivaient dans les décorateurs du DTO,
 * c'est-à-dire dans la couche HTTP (§27). Un import ou un script les aurait
 * contournées sans le savoir.
 */
@Injectable()
export class DeclarerBeneficiaireUseCase {
  constructor(
    @Inject(REGISTRE_DES_BENEFICIAIRES_REPOSITORY)
    private readonly registres: RegistreDesBeneficiairesRepository,
    // Le contrôle d'appartenance vit là, pour tous ses appelants — le recopier
    // ici en ferait une seconde version à tenir à jour.
    private readonly getProfilPM: GetProfilPMUseCase,
  ) {}

  async execute(
    userId: number,
    societeId: string,
    champs: ChampsBeneficiaire,
  ): Promise<BeneficiaireEffectifSnapshot[]> {
    // Répond « introuvable » à qui n'est pas le titulaire — un 403
    // confirmerait l'existence de l'identifiant.
    await this.getProfilPM.execute(userId, societeId);

    const registre = await this.registres.parSociete(societeId);

    // Peut lever : donnée refusée, ou capital dépassé. Rien n'est persisté.
    registre.declarer(champs);

    const enregistre = await this.registres.save(registre);

    // Le registre entier, et non la seule déclaration : le total des parts a
    // changé, et c'est l'écran que le titulaire relit.
    return enregistre.beneficiairesPublies;
  }
}

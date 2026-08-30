import { Inject, Injectable } from '@nestjs/common';
import {
  PROFIL_INVESTISSEUR_ACTIF_REPOSITORY,
  type ProfilInvestisseurActifRepository,
} from 'src/onboarding/domain/repositories/profil-investisseur-actif.repository';
import { ProfilInvestisseur } from 'src/onboarding/domain/value-objects/profil-investisseur.vo';
import { GetProfilPMUseCase } from '../profiles/get-profil-pm.usecase';
import {
  ListerProfilsInvestisseurUseCase,
  ProfilDisponible,
} from './lister-profils-investisseur.usecase';

/**
 * Bascule vers l'identité au nom de laquelle le compte agit.
 *
 * `societeId` nul ramène au nom propre — le repli, toujours disponible : on ne
 * peut pas se retrouver bloqué dans une société dont le dossier a été refusé.
 *
 * **L'appartenance est vérifiée, l'aptitude ne l'est pas.** On peut basculer
 * vers une société dont le dossier est incomplet : c'est même le parcours
 * normal, puisque c'est en étant dessus qu'on dépose ses justificatifs. La
 * liste rendue dit ce qui manque, et ce sont les opérations financières qui
 * refusent — pas le sélecteur.
 *
 * > ⚠️ **Ce choix n'est pas une autorisation.** Il dit ce que les écrans de
 * > conformité montrent ; il ne détermine pas encore qui souscrit. `Investment`
 * > et `Reservation` sont clés sur `utilisateurId`, c'est-à-dire sur le
 * > **compte** : une souscription passée après une bascule sera enregistrée au
 * > nom du titulaire, pas de la société. Tant que ces contextes ne portent pas
 * > un `SouscripteurId`, aucune route financière ne doit lire ce profil actif —
 * > le lire donnerait une autorité que rien ne vérifie en aval.
 */
@Injectable()
export class BasculerProfilInvestisseurUseCase {
  constructor(
    @Inject(PROFIL_INVESTISSEUR_ACTIF_REPOSITORY)
    private readonly profilActif: ProfilInvestisseurActifRepository,
    // Le contrôle d'appartenance vit là, pour tous ses appelants.
    private readonly getProfilPM: GetProfilPMUseCase,
    private readonly listerProfils: ListerProfilsInvestisseurUseCase,
  ) {}

  async execute(
    userId: number,
    societeId: string | null,
  ): Promise<ProfilDisponible[]> {
    if (societeId !== null) {
      // Répond « introuvable » à qui n'est pas le titulaire : sans ce contrôle,
      // l'uuid d'une société suffirait à agir en son nom.
      await this.getProfilPM.execute(userId, societeId);
    }

    await this.profilActif.basculer(
      userId,
      societeId === null
        ? ProfilInvestisseur.personnePhysique()
        : ProfilInvestisseur.societe(societeId),
    );

    // La liste entière, et non le seul profil choisi : le drapeau `actif` a
    // changé partout, et c'est l'état que le sélecteur réaffiche.
    return this.listerProfils.execute(userId);
  }
}

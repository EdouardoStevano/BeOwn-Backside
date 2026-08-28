import { Inject, Injectable } from '@nestjs/common';
import {
  INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
  type InvestorComplianceProfileRepository,
} from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/compliance/domain/repositories/profil-pm.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/compliance/domain/repositories/profil-pp.repository';
import {
  DOSSIER_DE_PIECES_REPOSITORY,
  type DossierDePiecesRepository,
} from 'src/compliance/domain/repositories/dossier-de-pieces.repository';
import {
  PROFIL_INVESTISSEUR_ACTIF_REPOSITORY,
  type ProfilInvestisseurActifRepository,
} from 'src/compliance/domain/repositories/profil-investisseur-actif.repository';
import {
  NatureProfilInvestisseur,
  ProfilInvestisseur,
} from 'src/compliance/domain/value-objects/profil-investisseur.vo';
import {
  AptitudeDuProfil,
  aptitudeDeLaPersonnePhysique,
  aptitudeDeLaSociete,
} from 'src/compliance/domain/domain-services/aptitude-du-profil.domain-service';
import {
  BENEFICIAIRES_DE_LA_SOCIETE_QUERY,
  type BeneficiairesDeLaSocieteQuery,
} from '../../ports/beneficiaires-de-la-societe.query';

/** Un profil entre lesquels le compte peut basculer. */
export interface ProfilDisponible {
  nature: NatureProfilInvestisseur;
  /** `null` pour le nom propre — cf. `ProfilInvestisseur`. */
  societeId: string | null;
  /** Ce que l'écran affiche : « En mon nom » ou la raison sociale. */
  libelle: string;
  actif: boolean;
  aptitude: AptitudeDuProfil;
}

/**
 * Les identités entre lesquelles un compte peut basculer, et ce que chacune
 * permet.
 *
 * **Une seule requête pour l'écran de bascule.** Le front avait besoin de trois
 * choses pour l'afficher — la liste des sociétés, le profil actif, et si
 * chacune est en état d'opérer — dont la dernière suppose de composer le
 * dossier de conformité du représentant, l'immatriculation de la société, ses
 * bénéficiaires et ses justificatifs. Les lui faire assembler l'aurait obligé à
 * réimplémenter une règle réglementaire qu'il ne peut pas éprouver.
 *
 * L'aptitude est **rendue avec son motif** : un sélecteur qui grise une société
 * sans dire pourquoi renvoie le titulaire à deviner s'il lui manque un KBIS, un
 * bénéficiaire ou sa propre vérification d'identité.
 *
 * Le KYC du représentant est lu **une fois** et vaut pour toutes ses sociétés :
 * c'est précisément l'économie que le cahier des charges cherche — « sans avoir
 * besoin de compléter les informations redondantes ».
 */
@Injectable()
export class ListerProfilsInvestisseurUseCase {
  constructor(
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilsPP: ProfilPPRepository,
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly societes: ProfilPMRepository,
    @Inject(INVESTOR_COMPLIANCE_PROFILE_REPOSITORY)
    private readonly conformite: InvestorComplianceProfileRepository,
    @Inject(DOSSIER_DE_PIECES_REPOSITORY)
    private readonly dossiers: DossierDePiecesRepository,
    @Inject(BENEFICIAIRES_DE_LA_SOCIETE_QUERY)
    private readonly beneficiaires: BeneficiairesDeLaSocieteQuery,
    @Inject(PROFIL_INVESTISSEUR_ACTIF_REPOSITORY)
    private readonly profilActif: ProfilInvestisseurActifRepository,
  ) {}

  async execute(userId: number): Promise<ProfilDisponible[]> {
    // Quatre lectures indépendantes, menées de front.
    const [profilPP, societes, conformite, actif] = await Promise.all([
      this.profilsPP.findByUserId(userId).catch(() => null),
      this.societes.listerParUtilisateur(userId),
      this.conformite.findByInvestorId(userId),
      this.profilActif.lire(userId),
    ]);

    // Lu une fois : le représentant est le même pour toutes ses sociétés.
    const kycDuRepresentantValide = conformite.peutOperer();

    const nomPropre: ProfilDisponible = {
      nature: NatureProfilInvestisseur.PP,
      societeId: null,
      libelle: profilPP ? 'En mon nom propre' : 'En mon nom propre (à compléter)',
      actif: actif.estPersonnePhysique(),
      aptitude: aptitudeDeLaPersonnePhysique(kycDuRepresentantValide),
    };

    const parSociete = await Promise.all(
      societes.map(async (societe) => {
        const [dossier, beneficiaires] = await Promise.all([
          this.dossiers.parSociete(societe.id),
          this.beneficiaires.parSociete(societe.id),
        ]);

        return {
          nature: NatureProfilInvestisseur.PM,
          societeId: societe.id,
          libelle: societe.identiteLegale.raisonSociale,
          actif: actif.societeId === societe.id,
          aptitude: aptitudeDeLaSociete({
            kycDuRepresentantValide,
            societeImmatriculee: societe.estImmatriculee(),
            dossier,
            beneficiaires: beneficiaires.map((b) => b.id),
          }),
        } satisfies ProfilDisponible;
      }),
    );

    // Le nom propre en tête : c'est le repli, et l'ordre de l'écran.
    return [nomPropre, ...parSociete];
  }

  /** Le profil actif seul — ce que les autres écrans relisent. */
  async actif(userId: number): Promise<ProfilInvestisseur> {
    return this.profilActif.lire(userId);
  }
}

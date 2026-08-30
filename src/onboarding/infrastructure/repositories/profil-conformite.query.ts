import { Inject, Injectable } from '@nestjs/common';
import { StatutKyb } from 'src/onboarding/domain/enums/statut-kyb.enum';
import {
  aptitudeDeLaPersonnePhysique,
  aptitudeDeLaSociete,
} from 'src/onboarding/domain/domain-services/aptitude-du-profil.domain-service';
import {
  EligibiliteDuTitulaire,
  ProfilConformiteQuery,
} from 'src/onboarding/application/ports/profil-conformite.query';
import {
  CLASSEMENT_DU_TITULAIRE_QUERY,
  type ClassementDuTitulaireQuery,
} from 'src/adequacy/application/ports/classement-du-titulaire.query';
import {
  DOSSIER_DE_PIECES_REPOSITORY,
  type DossierDePiecesRepository,
} from 'src/onboarding/domain/repositories/dossier-de-pieces.repository';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/onboarding/domain/repositories/profil-pm.repository';
import {
  BENEFICIAIRES_DE_LA_SOCIETE_QUERY,
  type BeneficiairesDeLaSocieteQuery,
} from 'src/onboarding/application/ports/beneficiaires-de-la-societe.query';
import { DossierDEntreeEnRelationTypeOrmRepository } from './dossier-d-entree-en-relation.repository';

/**
 * Lectures du dossier de conformité pour les contextes en aval.
 *
 * **Elle compose deux contextes.** L'aptitude à opérer est de ce contexte-ci ;
 * le classement PSFP vient de l'adéquation, par son port. C'est l'unique arête
 * entre les deux moitiés de l'ancien module de conformité, et elle ne va que
 * dans ce sens : l'adéquation ne lit ni KYC, ni KYB, ni pièces.
 *
 * **Deux lectures, parce qu'il y a deux investisseurs possibles.** Un compte
 * souscrit en son nom propre ou au nom d'une de ses sociétés, et le classement
 * PSFP s'apprécie sur l'investisseur : une SAS peut être professionnelle quand
 * son dirigeant est non-averti. Opposer à l'une le verdict de l'autre lui
 * imposerait un plafond et un délai de rétractation qui ne la concernent pas.
 */
@Injectable()
export class ProfilConformiteTypeOrmQuery implements ProfilConformiteQuery {
  constructor(
    private readonly dossiers: DossierDEntreeEnRelationTypeOrmRepository,
    // **L'autre moitié de l'ancien dossier de conformité.** `EligibiliteDuTitulaire`
    // est la seule question qui les traverse toutes deux — « peut-il opérer, et
    // jusqu'où » — et les contextes financiers en aval la posent d'un seul
    // tenant. Par le port du contexte voisin, jamais par son repository : ce qui
    // en revient est un classement publié, pas son agrégat (§13).
    @Inject(CLASSEMENT_DU_TITULAIRE_QUERY)
    private readonly classements: ClassementDuTitulaireQuery,
    // Par leurs ports et non par leurs classes : cette Query compose trois
    // agrégats voisins, et en dépendre concrètement ferait de l'infrastructure
    // le point de couplage entre eux (§33 — Dependency Inversion).
    @Inject(DOSSIER_DE_PIECES_REPOSITORY)
    private readonly dossiersDePieces: DossierDePiecesRepository,
    @Inject(BENEFICIAIRES_DE_LA_SOCIETE_QUERY)
    private readonly beneficiaires: BeneficiairesDeLaSocieteQuery,
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly societes: ProfilPMRepository,
  ) {}

  async eligibilite(investorId: number): Promise<EligibiliteDuTitulaire> {
    const [dossier, classement] = await Promise.all([
      this.dossiers.parTitulaire(investorId),
      this.classements.duTitulaire(investorId),
    ]);
    return {
      investorId,
      societeId: null,
      aptitude: aptitudeDeLaPersonnePhysique(dossier.peutOperer()),
      classement,
    };
  }

  /**
   * L'éligibilité d'une société : **son** classement, et l'aptitude composée.
   *
   * Le KYC lu est celui du titulaire — une société n'a pas d'identité à
   * vérifier, c'est son représentant qui signe pour elle, et cette
   * vérification vaut pour toutes ses sociétés.
   *
   * Une société inconnue du compte rend un verdict **négatif**, jamais une
   * erreur : ce port sert des contextes financiers en aval, et leur faire
   * distinguer « refusé » de « introuvable » les inviterait à traiter le second
   * comme un cas passant.
   */
  async eligibiliteDeLaSociete(
    investorId: number,
    societeId: string,
  ): Promise<EligibiliteDuTitulaire> {
    const [dossierDeLaSociete, classement, dossierDuRepresentant, societe] =
      await Promise.all([
        this.dossiers.parSociete(investorId, societeId),
        this.classements.deLaSociete(investorId, societeId),
        this.dossiers.parTitulaire(investorId),
        this.societes.findById(societeId),
      ]);

    const sienne = societe !== null && societe.userId === investorId;
    if (!sienne) {
      return {
        investorId,
        societeId,
        aptitude: {
          peutOperer: false,
          motifs: [
            {
              code: 'SOCIETE_NON_IMMATRICULEE',
              libelle: "Cette société n'est pas rattachée à votre compte.",
            },
          ],
        },
        classement,
      };
    }

    const [pieces, beneficiaires] = await Promise.all([
      this.dossiersDePieces.parSociete(societeId),
      this.beneficiaires.parSociete(societeId),
    ]);

    const aptitude = aptitudeDeLaSociete({
      kycDuRepresentantValide: dossierDuRepresentant.peutOperer(),
      // Le verdict opposable de la société : sa propre racine le porte, daté et
      // signé, plutôt qu'un calcul refait à chaque lecture.
      kybValide: dossierDeLaSociete.peutOperer(),
      // `parSociete` rend toujours une racine de société, donc un statut non
      // nul ; le repli reste explicite plutôt qu'affirmé par une assertion —
      // et c'est le plus prudent des quatre états.
      statutKyb: dossierDeLaSociete.statutKyb ?? StatutKyb.EN_CONSTITUTION,
      societeImmatriculee: societe.estImmatriculee(),
      dossier: pieces,
      beneficiaires: beneficiaires.map((b) => b.id),
    });

    return { investorId, societeId, aptitude, classement };
  }
}

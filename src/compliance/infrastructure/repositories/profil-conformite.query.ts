import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';
import { StatutKyb } from 'src/compliance/domain/enums/statut-kyb.enum';
import {
  aptitudeDeLaPersonnePhysique,
  aptitudeDeLaSociete,
} from 'src/compliance/domain/domain-services/aptitude-du-profil.domain-service';
import {
  ContactDu,
  EligibiliteDuTitulaire,
  ProfilConformiteQuery,
} from 'src/compliance/application/ports/profil-conformite.query';
import {
  DOSSIER_DE_PIECES_REPOSITORY,
  type DossierDePiecesRepository,
} from 'src/compliance/domain/repositories/dossier-de-pieces.repository';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/compliance/domain/repositories/profil-pm.repository';
import {
  BENEFICIAIRES_DE_LA_SOCIETE_QUERY,
  type BeneficiairesDeLaSocieteQuery,
} from 'src/compliance/application/ports/beneficiaires-de-la-societe.query';
import { InvestorComplianceProfileTypeOrmRepository } from './investor-compliance-profile.repository';
import { InvestorComplianceProfileEntity } from '../persistence/entities/investor-compliance-profile.entity';

/**
 * Lectures du dossier de conformité pour les contextes en aval.
 *
 * L'éligibilité passe par les **racines** plutôt que par une requête à plat, et
 * c'est délibéré : la catégorie et le plafond ne sont pas stockés tels quels,
 * ils sont calculés — `plafondConseille()` applique la formule PSFP au
 * patrimoine du questionnaire. Les recalculer ici en SQL les mettrait en
 * double, exactement ce que la copie sur `profil_pp` faisait (§3.3).
 *
 * **Deux lectures, parce qu'il y a deux investisseurs possibles.** Un compte
 * souscrit en son nom propre ou au nom d'une de ses sociétés, et le classement
 * PSFP s'apprécie sur l'investisseur : une SAS peut être professionnelle quand
 * son dirigeant est non-averti. Opposer à l'une le verdict de l'autre lui
 * imposerait un plafond et un délai de rétractation qui ne la concernent pas.
 *
 * La liste des contacts dus, elle, est une vraie projection : elle filtre des
 * colonnes, ne dérive rien, et n'a aucune raison de reconstruire une racine par
 * ligne (§11).
 */
@Injectable()
export class ProfilConformiteTypeOrmQuery implements ProfilConformiteQuery {
  constructor(
    private readonly profils: InvestorComplianceProfileTypeOrmRepository,
    // Par leurs ports et non par leurs classes : cette Query compose trois
    // agrégats voisins, et en dépendre concrètement ferait de l'infrastructure
    // le point de couplage entre eux (§33 — Dependency Inversion).
    @Inject(DOSSIER_DE_PIECES_REPOSITORY)
    private readonly dossiersDePieces: DossierDePiecesRepository,
    @Inject(BENEFICIAIRES_DE_LA_SOCIETE_QUERY)
    private readonly beneficiaires: BeneficiairesDeLaSocieteQuery,
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly societes: ProfilPMRepository,
    @InjectRepository(InvestorComplianceProfileEntity)
    private readonly registre: Repository<InvestorComplianceProfileEntity>,
  ) {}

  async eligibilite(investorId: number): Promise<EligibiliteDuTitulaire> {
    const profil = await this.profils.findByInvestorId(investorId);
    const classement = profil.classement.toSnapshot();
    const aptitude = aptitudeDeLaPersonnePhysique(profil.peutOperer());

    return {
      investorId,
      societeId: null,
      categoriePsfp: classement.categoriePsfp,
      estNonAverti: profil.estNonAverti(),
      plafondConseille: profil.plafondConseille(),
      patrimoineDeclare: classement.patrimoineDeclare,
      peutOperer: aptitude.peutOperer,
      motifs: aptitude.motifs,
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
    const [dossierDeLaSociete, conformiteDuRepresentant, societe] =
      await Promise.all([
        this.profils.parSociete(investorId, societeId),
        this.profils.findByInvestorId(investorId),
        this.societes.findById(societeId),
      ]);

    const classement = dossierDeLaSociete.classement.toSnapshot();

    const sienne = societe !== null && societe.userId === investorId;
    if (!sienne) {
      return {
        investorId,
        societeId,
        categoriePsfp: classement.categoriePsfp,
        estNonAverti: dossierDeLaSociete.estNonAverti(),
        plafondConseille: dossierDeLaSociete.plafondConseille(),
        patrimoineDeclare: classement.patrimoineDeclare,
        peutOperer: false,
        motifs: [
          {
            code: 'SOCIETE_NON_IMMATRICULEE',
            libelle: "Cette société n'est pas rattachée à votre compte.",
          },
        ],
      };
    }

    const [pieces, beneficiaires] = await Promise.all([
      this.dossiersDePieces.parSociete(societeId),
      this.beneficiaires.parSociete(societeId),
    ]);

    const aptitude = aptitudeDeLaSociete({
      kycDuRepresentantValide: conformiteDuRepresentant.peutOperer(),
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

    return {
      investorId,
      societeId,
      categoriePsfp: classement.categoriePsfp,
      estNonAverti: dossierDeLaSociete.estNonAverti(),
      plafondConseille: dossierDeLaSociete.plafondConseille(),
      patrimoineDeclare: classement.patrimoineDeclare,
      peutOperer: aptitude.peutOperer,
      motifs: aptitude.motifs,
    };
  }

  async contactsDus(limite: number): Promise<ContactDu[]> {
    const lignes = await this.registre.find({
      where: [
        {
          prochainContactDu: LessThanOrEqual(new Date()),
          // Le contact périodique vise une personne joignable, pas une
          // société : seules les lignes du titulaire entrent dans la campagne.
          souscripteurSocieteId: IsNull(),
        },
        {
          prochainContactDu: IsNull(),
          niveauRisque: NiveauRisque.VULNERABLE,
          souscripteurSocieteId: IsNull(),
        },
      ],
      order: { prochainContactDu: 'ASC' },
      take: limite,
    });

    return lignes.map((ligne) => ({
      investorId: ligne.userId,
      niveauRisque: ligne.niveauRisque,
      dernierContactAdmin: ligne.dernierContactAdmin,
      prochainContactDu: ligne.prochainContactDu,
    }));
  }
}

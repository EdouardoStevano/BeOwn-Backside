import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import {
  LienAvecPrestataire,
  verifierEligibilitePorteur,
  verifierInvestisseurNonPorteur,
  verifierPorteurSansPartsDeLaSocieteSupport,
} from 'src/projects/domains/conflits-interets';
import {
  DetenteurDePartsDeLaSocieteSupportError,
  PorteurDeSonPropreProjetError,
} from 'src/projects/domains/errors/conflits-interets.errors';
import { PROJECT_REPOSITORY } from 'src/projects/applications/ports/repositories/project.repository';
import type { ProjectRepository } from 'src/projects/applications/ports/repositories/project.repository';
import { INVESTMENT_REPOSITORY } from 'src/investments/applications/ports/repositories/investment.repository';
import type { InvestmentRepository } from 'src/investments/applications/ports/repositories/investment.repository';

/**
 * Projet dont on connaît déjà le porteur — la forme minimale qui suffit à
 * trancher. Les appelants qui ont chargé le projet (souscription, réservation,
 * ajout de fractions) passent l'objet et n'occasionnent AUCUNE requête de plus.
 */
export interface ProjetIdentifiePourConflit {
  porteurId: number | null;
}

/** Ce que l'assertion accepte : l'identifiant du projet, ou le projet lui-même. */
export type ReferenceProjet = string | ProjetIdentifiePourConflit;

/**
 * Point unique où se décident les conflits d'intérêts liés au porteur.
 *
 * Deux règles y cohabitent, distinctes par leur fondement :
 *
 *  1. ÉLIGIBILITÉ À PORTER UNE OFFRE — art. 8 du règlement (UE) 2020/1503 :
 *     ni le prestataire, ni ses dirigeants, salariés, actionnaires qualifiés ou
 *     personnes liées ne peuvent être porteurs. Le lien vient du RÔLE (tout
 *     accès back-office vaut lien d'emploi) et d'une DÉCLARATION de profil,
 *     seule capable de couvrir ce que le système ne peut pas deviner.
 *
 *  2. SÉPARATION PORTEUR / INVESTISSEUR — décision fondateur D5, reprise par la
 *     clause « conflits » des CGU : le porteur d'un projet n'y engage pas
 *     d'argent, et réciproquement. Voir `domains/conflits-interets.ts` pour le
 *     fondement (pratique commerciale trompeuse, circularité LCB-FT).
 *
 * Ces règles sont réunies ici, et pas dispersées en sept contrôles, pour
 * qu'aucune porte d'entrée ne puisse diverger des autres. La décision
 * elle-même appartient au domaine ; ce service réunit les faits et lève
 * l'erreur métier correspondante.
 */
@Injectable()
export class ConflitsInteretsService {
  private readonly logger = new Logger(ConflitsInteretsService.name);

  /** Rôles impliquant un accès back-office, donc un lien d'emploi ou de direction. */
  private static readonly ROLES_INTERNES: UserRole[] = [
    UserRole.SUPER_ADMIN,
    UserRole.CIO,
    UserRole.MARKETING,
    UserRole.ANALYSTE_FINANCIER,
    UserRole.CHARGE_RELATION_INVESTISSEUR,
    UserRole.SUPPORT,
    UserRole.COMPLIANCE,
    UserRole.DPO,
    UserRole.RCCI,
    UserRole.FINANCIER,
  ];

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProfilPPEntity)
    private readonly profilRepo: Repository<ProfilPPEntity>,
    // Ports (DIP) : la règle D5 doit pouvoir résoudre un projet ou une position
    // sans connaître l'ORM. Ajoutés en QUEUE de constructeur, comme partout
    // dans ce dépôt, pour ne décaler aucun argument existant.
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
  ) {}

  /**
   * Lève une `BadRequestException` si l'art. 8 interdit à cet utilisateur de
   * porter une offre. Ne fait rien si aucun lien n'est établi.
   */
  async assertPorteurEligible(porteurId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId: porteurId } });
    if (!user) return;

    const profil = await this.profilRepo.findOne({
      where: { utilisateurId: porteurId },
    });

    const lien = this.determinerLien(user, profil);
    const verdict = verifierEligibilitePorteur({
      lien,
      participation: profil?.participationPrestataire ?? undefined,
    });

    if (!verdict.autorise) {
      this.logger.warn(
        `Offre refusée pour conflit d'intérêts : porteurId=${porteurId} lien=${lien}`,
      );
      throw new BadRequestException(verdict.motif ?? 'Conflit d\'intérêts.');
    }
  }

  /**
   * Décision D5 — refuse à un utilisateur toute opération d'engagement sur un
   * projet DONT IL EST LE PORTEUR.
   *
   * La cible est le porteur de CE projet précis, jamais le rôle : un porteur
   * investit normalement dans les projets des autres porteurs. Un projet sans
   * porteur identifié n'exclut personne.
   *
   * @param utilisateurId celui qui engage l'argent (souscripteur, réservataire,
   *   ou ACHETEUR d'une cession — jamais le vendeur)
   * @param projet le projet déjà chargé (aucune requête) ou son identifiant
   * @throws PorteurDeSonPropreProjetError traduite en 403 par le filtre
   */
  async assertPasPorteurDuProjet(
    utilisateurId: number,
    projet: ReferenceProjet,
  ): Promise<void> {
    const porteurId = await this.resoudrePorteur(projet);
    // Projet introuvable : ce n'est pas à cette garde de le dire. L'appelant
    // a son propre 404, plus précis, et refuser ici masquerait la vraie cause.
    if (porteurId === undefined) return;

    const verdict = verifierInvestisseurNonPorteur(utilisateurId, porteurId);
    if (verdict.autorise) return;

    this.logger.warn(
      `Engagement refusé pour conflit d'intérêts : utilisateur ${utilisateurId} ` +
        'est le porteur du projet visé (décision D5).',
    );
    throw new PorteurDeSonPropreProjetError(
      verdict.motif ?? "Conflit d'intérêts.",
    );
  }

  /**
   * Même règle, appliquée au marché secondaire : les parts cédées désignent
   * leur projet par l'investissement d'origine du vendeur.
   *
   * Acheter des parts revient à souscrire ; le porteur du projet n'a pas plus
   * le droit d'entrer par cette porte que par la souscription primaire.
   *
   * @param acheteurId celui qui acquiert les parts, jamais le vendeur
   */
  async assertPasPorteurDuProjetCede(
    acheteurId: number,
    investissementId: string,
  ): Promise<void> {
    const investissement =
      await this.investmentRepository.findInvestmentById(investissementId);
    if (!investissement) return;

    await this.assertPasPorteurDuProjet(acheteurId, investissement.projetId);
  }

  /**
   * Réciproque de D5 — refuse de rattacher comme porteur quelqu'un qui détient
   * déjà des parts de la société support du projet.
   *
   * Sans société support déclarée, il n'y a pas d'émetteur commun à constater :
   * la règle n'a pas d'objet et laisse passer.
   *
   * @throws DetenteurDePartsDeLaSocieteSupportError traduite en 409
   */
  async assertPorteurSansPartsDeLaSocieteSupport(
    porteurId: number,
    spvId: string | null | undefined,
  ): Promise<void> {
    if (!spvId) return;

    const detient =
      await this.investmentRepository.existeDetentionSurSocieteSupport(
        porteurId,
        spvId,
      );

    const verdict = verifierPorteurSansPartsDeLaSocieteSupport(detient);
    if (verdict.autorise) return;

    this.logger.warn(
      `Rattachement porteur refusé pour conflit d'intérêts : utilisateur ` +
        `${porteurId} détient déjà des parts de la société support ${spvId} ` +
        '(décision D5, sens inverse).',
    );
    throw new DetenteurDePartsDeLaSocieteSupportError(
      verdict.motif ?? "Conflit d'intérêts.",
    );
  }

  /**
   * Porteur du projet visé : `undefined` quand le projet est introuvable, ce
   * qui se distingue d'un `null` — projet sans porteur, donc sans exclusion.
   */
  private async resoudrePorteur(
    projet: ReferenceProjet,
  ): Promise<number | null | undefined> {
    if (typeof projet !== 'string') return projet.porteurId ?? null;

    const charge = await this.projectRepository.findProjectById(projet);
    return charge ? (charge.porteurId ?? null) : undefined;
  }

  private determinerLien(
    user: UserEntity,
    profil: ProfilPPEntity | null,
  ): LienAvecPrestataire {
    if (ConflitsInteretsService.ROLES_INTERNES.includes(user.role)) {
      return user.role === UserRole.SUPER_ADMIN
        ? LienAvecPrestataire.DIRIGEANT
        : LienAvecPrestataire.SALARIE;
    }

    return profil?.lienAvecPrestataire ?? LienAvecPrestataire.AUCUN;
  }
}

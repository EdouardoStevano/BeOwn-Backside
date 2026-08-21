import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import {
  LienAvecPrestataire,
  verifierEligibilitePorteur,
} from 'src/projects/domains/conflits-interets';

/**
 * Applique les interdictions de l'art. 8 du règlement (UE) 2020/1503 au moment
 * où un porteur soumet une offre.
 *
 * Le lien avec le prestataire vient de deux sources complémentaires :
 *  - le RÔLE de l'utilisateur, qui suffit à identifier les salariés et
 *    dirigeants : quiconque dispose d'un accès back-office est, de fait, une
 *    personne liée au prestataire ;
 *  - une DÉCLARATION portée par le profil, seule capable de couvrir les
 *    actionnaires et les personnes liées par une relation de contrôle, que
 *    rien dans le système ne permet de deviner.
 *
 * La décision elle-même appartient au domaine ; ce service ne fait que réunir
 * les faits et traduire le refus en erreur HTTP.
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

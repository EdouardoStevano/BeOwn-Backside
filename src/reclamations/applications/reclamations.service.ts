import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ReclamationEntity } from '../infrastructure/persistences/entities/reclamation.entity';
import {
  StatutReclamation,
  echeanceReponse,
  evaluerDelais,
  genererReference,
} from '../domains/reclamation';
import {
  CreateReclamationDto,
  RepondreReclamationDto,
} from '../presenters/dto/reclamation.dto';
import { hasPermission } from 'src/common/auth/permissions.constants';

/**
 * Identité de l'appelant : ce qui suffit à décider de son habilitation, et
 * rien de plus.
 *
 * ## Pourquoi une identité, et pas un booléen
 *
 * Ce service recevait de son contrôleur un `estBackOffice: boolean` que le
 * presenter calculait lui-même — et calculait par EXCLUSION : « tout rôle qui
 * n'est pas investisseur ». Un compte `marketing`, `cgp`, `porteur`, `cio`,
 * `financier`, `analyste_financier`, `charge_relation_investisseur` ou `dpo`
 * — aucun ne détenant `reclamations:manage` — lisait ainsi n'importe quelle
 * réclamation : identité du plaignant, description du litige, réponse de la
 * plateforme. Un rôle inconnu (jeton émis avant une migration) passait aussi.
 *
 * La correction ne se limite pas à réécrire le test : le presenter ne
 * transmet plus un DROIT, il transmet une IDENTITÉ, et c'est le service qui
 * décide. Aucun appelant — contrôleur, worker, script — ne peut plus
 * s'auto-déclarer habilité.
 */
export interface AppelantReclamation {
  userId: number;
  /** Rôle porté par le jeton ; absent ou inconnu ⇒ aucune permission. */
  role?: string;
}

/**
 * Traitement des réclamations — art. 27 du règlement (UE) 2020/1503.
 *
 * Le dépôt est gratuit et immédiatement accusé réception : plutôt que de
 * promettre un accusé sous dix jours ouvrables et de devoir le surveiller, on
 * l'émet à la seconde du dépôt. Le délai réglementaire reste calculé et
 * exposé, pour que tout retard soit visible même dans ce cas.
 *
 * Habilitation : une réclamation se lit par son DEMANDEUR, ou par un rôle
 * portant `reclamations:manage` — c'est la seule source de vérité, partagée
 * avec le `PermissionsGuard` des routes de back-office.
 */
@Injectable()
export class ReclamationsService {
  private readonly logger = new Logger(ReclamationsService.name);

  constructor(
    @InjectRepository(ReclamationEntity)
    private readonly reclamationRepo: Repository<ReclamationEntity>,
  ) {}

  async deposer(
    utilisateurId: number,
    dto: CreateReclamationDto,
  ): Promise<ReclamationEntity> {
    const maintenant = new Date();
    const reference = await this.genererReferenceDuJour(maintenant);

    const reclamation = this.reclamationRepo.create({
      reference,
      utilisateurId,
      categorie: dto.categorie,
      objet: dto.objet,
      description: dto.description,
      projetId: dto.projetId ?? null,
      investissementId: dto.investissementId ?? null,
      // L'accusé de réception est concomitant du dépôt : l'obligation de
      // l'art. 27 est satisfaite sans délai ni relance.
      statut: StatutReclamation.ACCUSE_RECEPTION,
      accuseReceptionLe: maintenant,
      echeanceReponse: echeanceReponse(maintenant),
    });

    const saved = await this.reclamationRepo.save(reclamation);
    this.logger.log(
      `Réclamation ${saved.reference} déposée par userId=${utilisateurId} ` +
        `categorie=${saved.categorie} echeance=${saved.echeanceReponse.toISOString()}`,
    );
    return saved;
  }

  /** Réclamations d'un utilisateur, les plus récentes d'abord. */
  async listerPourUtilisateur(utilisateurId: number): Promise<ReclamationEntity[]> {
    return this.reclamationRepo.find({
      where: { utilisateurId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Consultation d'une réclamation : par son DEMANDEUR, ou par un rôle
   * habilité à les traiter.
   *
   * L'appartenance est vérifiée sur la ressource CHARGÉE — un contrôle par
   * rôle seul ne dirait rien de l'IDOR.
   */
  async consulter(
    id: string,
    appelant: AppelantReclamation,
  ): Promise<ReclamationEntity & { delais: ReturnType<typeof evaluerDelais> }> {
    const reclamation = await this.reclamationRepo.findOne({ where: { id } });
    if (!reclamation) throw new NotFoundException('Réclamation introuvable.');

    const estLeDemandeur = reclamation.utilisateurId === appelant.userId;
    if (!estLeDemandeur && !this.peutTraiter(appelant)) {
      throw new ForbiddenException(
        'Vous ne pouvez consulter que vos propres réclamations.',
      );
    }

    return { ...reclamation, delais: evaluerDelais(reclamation) };
  }

  /** File de traitement du back-office : les plus anciennes d'abord. */
  async listerPourBackOffice(
    appelant: AppelantReclamation,
    statut?: StatutReclamation,
  ): Promise<
    Array<ReclamationEntity & { delais: ReturnType<typeof evaluerDelais> }>
  > {
    this.assertPeutTraiter(appelant);

    const reclamations = await this.reclamationRepo.find({
      where: statut ? { statut } : {},
      order: { createdAt: 'ASC' },
    });
    return reclamations.map((r) => ({ ...r, delais: evaluerDelais(r) }));
  }

  async prendreEnInstruction(
    id: string,
    appelant: AppelantReclamation,
  ): Promise<ReclamationEntity> {
    this.assertPeutTraiter(appelant);

    const reclamation = await this.reclamationRepo.findOne({ where: { id } });
    if (!reclamation) throw new NotFoundException('Réclamation introuvable.');
    if (this.estClose(reclamation.statut)) {
      throw new BadRequestException('Cette réclamation est déjà close.');
    }

    reclamation.statut = StatutReclamation.EN_INSTRUCTION;
    reclamation.traiteParUserId = appelant.userId;
    return this.reclamationRepo.save(reclamation);
  }

  async repondre(
    id: string,
    appelant: AppelantReclamation,
    dto: RepondreReclamationDto,
  ): Promise<ReclamationEntity> {
    this.assertPeutTraiter(appelant);

    if (!this.estClose(dto.statut)) {
      throw new BadRequestException(
        'Une réponse clôt la réclamation : le statut doit être « resolue » ou « rejetee ».',
      );
    }

    const reclamation = await this.reclamationRepo.findOne({ where: { id } });
    if (!reclamation) throw new NotFoundException('Réclamation introuvable.');
    if (this.estClose(reclamation.statut)) {
      throw new BadRequestException('Cette réclamation a déjà reçu une réponse.');
    }

    reclamation.reponse = dto.reponse;
    reclamation.reponduLe = new Date();
    reclamation.statut = dto.statut;
    reclamation.traiteParUserId = appelant.userId;

    const saved = await this.reclamationRepo.save(reclamation);
    const delais = evaluerDelais(saved);
    this.logger.log(
      `Réclamation ${saved.reference} close (${saved.statut}) par userId=${appelant.userId}` +
        (delais.reponseEnRetard ? ' — HORS DÉLAI RÉGLEMENTAIRE' : ''),
    );
    return saved;
  }

  /**
   * Habilitation à traiter les réclamations d'autrui.
   *
   * Une seule permission fait foi — `reclamations:manage` — et c'est la même
   * que celle exigée par le `PermissionsGuard` sur les routes de back-office :
   * ajouter un rôle habilité se fait dans la matrice, jamais ici.
   */
  private peutTraiter(appelant: AppelantReclamation): boolean {
    return hasPermission(appelant.role, 'reclamations:manage');
  }

  /**
   * Défense en profondeur : les routes d'instruction et de réponse portent
   * déjà `@RequirePermission`, mais le service ne s'en remet pas au décorateur
   * d'un contrôleur pour protéger des données de litige.
   */
  private assertPeutTraiter(appelant: AppelantReclamation): void {
    if (!this.peutTraiter(appelant)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  private estClose(statut: StatutReclamation): boolean {
    return (
      statut === StatutReclamation.RESOLUE || statut === StatutReclamation.REJETEE
    );
  }

  /** Séquence quotidienne, pour une référence lisible et non devinable en volume. */
  private async genererReferenceDuJour(maintenant: Date): Promise<string> {
    const debutJour = new Date(maintenant);
    debutJour.setHours(0, 0, 0, 0);
    const finJour = new Date(debutJour);
    finJour.setDate(finJour.getDate() + 1);

    const dejaDeposees = await this.reclamationRepo.count({
      where: { createdAt: Between(debutJour, finJour) },
    });

    return genererReference(maintenant, dejaDeposees + 1);
  }
}

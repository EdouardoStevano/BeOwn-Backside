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

/**
 * Traitement des réclamations — art. 27 du règlement (UE) 2020/1503.
 *
 * Le dépôt est gratuit et immédiatement accusé réception : plutôt que de
 * promettre un accusé sous dix jours ouvrables et de devoir le surveiller, on
 * l'émet à la seconde du dépôt. Le délai réglementaire reste calculé et
 * exposé, pour que tout retard soit visible même dans ce cas.
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

  async consulter(
    id: string,
    utilisateurId: number,
    estBackOffice: boolean,
  ): Promise<ReclamationEntity & { delais: ReturnType<typeof evaluerDelais> }> {
    const reclamation = await this.reclamationRepo.findOne({ where: { id } });
    if (!reclamation) throw new NotFoundException('Réclamation introuvable.');
    if (!estBackOffice && reclamation.utilisateurId !== utilisateurId) {
      throw new ForbiddenException(
        'Vous ne pouvez consulter que vos propres réclamations.',
      );
    }
    return { ...reclamation, delais: evaluerDelais(reclamation) };
  }

  /** File de traitement du back-office : les plus anciennes d'abord. */
  async listerPourBackOffice(statut?: StatutReclamation): Promise<
    Array<ReclamationEntity & { delais: ReturnType<typeof evaluerDelais> }>
  > {
    const reclamations = await this.reclamationRepo.find({
      where: statut ? { statut } : {},
      order: { createdAt: 'ASC' },
    });
    return reclamations.map((r) => ({ ...r, delais: evaluerDelais(r) }));
  }

  async prendreEnInstruction(
    id: string,
    traiteParUserId: number,
  ): Promise<ReclamationEntity> {
    const reclamation = await this.reclamationRepo.findOne({ where: { id } });
    if (!reclamation) throw new NotFoundException('Réclamation introuvable.');
    if (this.estClose(reclamation.statut)) {
      throw new BadRequestException('Cette réclamation est déjà close.');
    }

    reclamation.statut = StatutReclamation.EN_INSTRUCTION;
    reclamation.traiteParUserId = traiteParUserId;
    return this.reclamationRepo.save(reclamation);
  }

  async repondre(
    id: string,
    traiteParUserId: number,
    dto: RepondreReclamationDto,
  ): Promise<ReclamationEntity> {
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
    reclamation.traiteParUserId = traiteParUserId;

    const saved = await this.reclamationRepo.save(reclamation);
    const delais = evaluerDelais(saved);
    this.logger.log(
      `Réclamation ${saved.reference} close (${saved.statut}) par userId=${traiteParUserId}` +
        (delais.reponseEnRetard ? ' — HORS DÉLAI RÉGLEMENTAIRE' : ''),
    );
    return saved;
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

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import {
  DemandeAccesPorteurReader,
  DemandeAccesPorteurWriter,
  type FiltreDemandesAccesPorteur,
  type PageDemandesAccesPorteur,
} from 'src/porteur-access/applications/ports/demande-acces-porteur.repository';
import {
  DemandeAccesPorteur,
  STATUTS_NON_TERMINAUX,
} from 'src/porteur-access/domains/demande-acces-porteur';
import { DemandeAccesPorteurEnCoursError } from 'src/porteur-access/domains/errors/porteur-access.errors';
import { DemandeAccesPorteurEntity } from '../entities/demande-acces-porteur.entity';
import { DemandeAccesPorteurMapper } from '../mappers/demande-acces-porteur.mapper';

/** Violation d'unicité PostgreSQL. */
const CODE_UNICITE_POSTGRES = '23505';

const estViolationUnicite = (erreur: unknown): boolean =>
  typeof erreur === 'object' &&
  erreur !== null &&
  (erreur as { driverError?: { code?: string }; code?: string }).driverError
    ?.code === CODE_UNICITE_POSTGRES;

const LIMITE_PAR_DEFAUT = 25;
const LIMITE_MAX = 100;

/**
 * Adaptateur PostgreSQL des deux ports du dépôt de demandes.
 *
 * Une seule classe pour deux contrats : le module la branche derrière chacun
 * (`useExisting`), exactement comme `StripePayoutMethodsService` l'est
 * derrière `PayoutMethodsReader`/`PayoutMethodsWriter`. Les appelants, eux,
 * n'injectent que le contrat dont ils ont besoin — un service de consultation
 * ne peut pas écrire (ISP).
 */
@Injectable()
export class TypeOrmDemandeAccesPorteurRepository
  implements DemandeAccesPorteurReader, DemandeAccesPorteurWriter
{
  constructor(
    @InjectRepository(DemandeAccesPorteurEntity)
    private readonly repo: Repository<DemandeAccesPorteurEntity>,
  ) {}

  async findById(id: string): Promise<DemandeAccesPorteur | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? DemandeAccesPorteurMapper.toDomain(row) : null;
  }

  async findEnCours(
    utilisateurId: number,
  ): Promise<DemandeAccesPorteur | null> {
    const row = await this.repo.findOne({
      where: { utilisateurId, statut: In([...STATUTS_NON_TERMINAUX]) },
    });
    return row ? DemandeAccesPorteurMapper.toDomain(row) : null;
  }

  async findDerniereDecidee(
    utilisateurId: number,
  ): Promise<DemandeAccesPorteur | null> {
    const row = await this.repo.findOne({
      where: { utilisateurId, decideeLe: Not(IsNull()) },
      order: { decideeLe: 'DESC' },
    });
    return row ? DemandeAccesPorteurMapper.toDomain(row) : null;
  }

  async historique(utilisateurId: number): Promise<DemandeAccesPorteur[]> {
    const rows = await this.repo.find({
      where: { utilisateurId },
      order: { soumiseLe: 'DESC' },
    });
    return rows.map((r) => DemandeAccesPorteurMapper.toDomain(r));
  }

  async lister(
    filtre: FiltreDemandesAccesPorteur,
  ): Promise<PageDemandesAccesPorteur> {
    // `Number(...) || défaut` neutralise aussi NaN (ex. ?page=abc), comme le
    // fait AuditLogService.findFiltered.
    const page = Math.max(1, Number(filtre.page) || 1);
    const limit = Math.min(
      LIMITE_MAX,
      Math.max(1, Number(filtre.limit) || LIMITE_PAR_DEFAUT),
    );

    const [rows, total] = await this.repo.findAndCount({
      where: filtre.statut ? { statut: filtre.statut } : {},
      order: { soumiseLe: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: rows.map((r) => DemandeAccesPorteurMapper.toDomain(r)),
      total,
      page,
      limit,
    };
  }

  async creer(demande: DemandeAccesPorteur): Promise<DemandeAccesPorteur> {
    try {
      const saved = await this.repo.save(
        this.repo.create(DemandeAccesPorteurMapper.toPersistence(demande)),
      );
      return DemandeAccesPorteurMapper.toDomain(saved);
    } catch (erreur) {
      // L'index unique partiel `UQ_demande_acces_porteur_en_cours` est le SEUL
      // contrôle qui tienne sous concurrence : deux requêtes simultanées
      // passent toutes deux la vérification applicative, une seule passe ici.
      // On la traduit dans le vocabulaire du domaine plutôt que de laisser
      // fuir une erreur de driver en 500.
      if (estViolationUnicite(erreur)) {
        throw new DemandeAccesPorteurEnCoursError();
      }
      throw erreur;
    }
  }

  async enregistrer(
    demande: DemandeAccesPorteur,
  ): Promise<DemandeAccesPorteur> {
    const saved = await this.repo.save(
      DemandeAccesPorteurMapper.toPersistence(
        demande,
      ) as DemandeAccesPorteurEntity,
    );
    return DemandeAccesPorteurMapper.toDomain(saved);
  }
}

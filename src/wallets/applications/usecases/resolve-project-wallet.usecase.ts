import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';

export const DEVISE_PAR_DEFAUT = 'EUR';

export interface ResolveProjectWalletOptions {
  devise?: string;
  /**
   * Verrouille la ligne projet avant la résolution (défaut : oui).
   * À ne passer à `false` que lorsque l'appelant détient déjà ce verrou et
   * qu'une relecture serait un pur coût, ou lorsque le projet n'existe plus.
   */
  verrouillerProjet?: boolean;
}

/**
 * Résout — en le créant à la demande — le wallet technique d'un projet.
 *
 * C'est la contrepartie manquante du grand livre : sans lui, le débit de
 * l'investisseur n'est crédité à personne et la somme des soldes n'est pas
 * conservée.
 *
 * IDEMPOTENCE SOUS CONCURRENCE — un seul wallet par projet est garanti par
 * deux barrières superposées :
 *  1. le verrou pessimiste sur la LIGNE PROJET, point de rendez-vous unique de
 *     toutes les écritures financières d'un projet (souscription, ajout de
 *     fractions, remboursement de collecte, confirmation de délai). Deux
 *     appels concurrents sur le même projet sont donc sérialisés : le second
 *     ne relit la table wallet qu'après le commit du premier, et retrouve le
 *     wallet déjà créé ;
 *  2. l'index unique partiel `(projetId, type)` en base, qui transforme une
 *     éventuelle course résiduelle en erreur bruyante plutôt qu'en doublon
 *     silencieux — un doublon de wallet scinderait le solde d'un projet en
 *     deux et rendrait le montant dû au porteur incalculable.
 *
 * Le wallet résolu est verrouillé en écriture : l'appelant peut créditer ou
 * débiter son solde sans relecture.
 */
@Injectable()
export class ResolveProjectWalletUseCase {
  private readonly logger = new Logger(ResolveProjectWalletUseCase.name);

  async executeInTransaction(
    manager: EntityManager,
    projetId: string,
    options: ResolveProjectWalletOptions = {},
  ): Promise<WalletEntity> {
    if (options.verrouillerProjet !== false) {
      await manager.findOne(ProjectEntity, {
        where: { id: projetId },
        lock: { mode: 'pessimistic_write' },
      });
    }

    const existant = await this.findVerrouille(manager, projetId);
    if (existant) return existant;

    const cree = await manager.save(WalletEntity, {
      type: WalletType.TECHNIQUE_PROJET,
      proprietaireUserId: null,
      projetId,
      spvId: null,
      fournisseurRef: `TECH-${projetId.slice(0, 8)}`,
      devise: options.devise ?? DEVISE_PAR_DEFAUT,
      solde: 0,
      soldeBloque: 0,
      statut: 'actif',
    } as Partial<WalletEntity>);

    this.logger.log(
      `Wallet technique créé pour le projet ${projetId} (wallet ${cree.id}).`,
    );
    return cree;
  }

  /** Lecture seule : renvoie `null` si aucun wallet technique n'existe encore. */
  async findInTransaction(
    manager: EntityManager,
    projetId: string,
  ): Promise<WalletEntity | null> {
    return manager.findOne(WalletEntity, {
      where: { projetId, type: WalletType.TECHNIQUE_PROJET },
    });
  }

  private findVerrouille(
    manager: EntityManager,
    projetId: string,
  ): Promise<WalletEntity | null> {
    return manager.findOne(WalletEntity, {
      where: { projetId, type: WalletType.TECHNIQUE_PROJET },
      lock: { mode: 'pessimistic_write' },
    });
  }
}

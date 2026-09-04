import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { DemandeAccesPorteur } from 'src/porteur-access/domains/demande-acces-porteur';
import { DemandeAccesPorteurIntrouvableError } from 'src/porteur-access/domains/errors/porteur-access.errors';
import {
  DemandeAccesPorteurReader,
  DemandeAccesPorteurWriter,
} from '../ports/demande-acces-porteur.repository';
import type { JournalAudit } from '../ports/services-transverses.port';

/**
 * Retrait de sa propre demande par le demandeur, tant qu'aucune décision n'est
 * rendue.
 *
 * L'anti-IDOR n'est pas ici mais dans le domaine (`DemandeAccesPorteur.retirer`
 * exige l'identifiant du propriétaire) : c'est une règle métier — « on ne
 * retire que sa propre demande » — et non un détail de transport, donc aucun
 * appelant ne peut l'oublier.
 */
@Injectable()
export class RetirerDemandePorteurUseCase {
  constructor(
    private readonly lecture: DemandeAccesPorteurReader,
    private readonly ecriture: DemandeAccesPorteurWriter,
    @Inject(AuditLogService) private readonly audit: JournalAudit,
  ) {}

  async execute(commande: {
    demandeId: string;
    utilisateurId: number;
    maintenant?: Date;
  }): Promise<DemandeAccesPorteur> {
    const demande = await this.lecture.findById(commande.demandeId);
    if (!demande) throw new DemandeAccesPorteurIntrouvableError();

    // 403 si la demande appartient à quelqu'un d'autre, 409 si elle est déjà
    // décidée — les deux viennent du domaine.
    demande.retirer(commande.utilisateurId, commande.maintenant ?? new Date());
    const enregistree = await this.ecriture.enregistrer(demande);

    await this.audit
      .create(
        String(commande.utilisateurId),
        UserRole.INVESTISSEUR,
        'porteur_access.demande.retiree',
        'demande_acces_porteur',
        commande.demandeId,
      )
      .catch(() => {});

    return enregistree;
  }
}

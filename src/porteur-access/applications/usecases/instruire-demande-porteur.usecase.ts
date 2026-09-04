import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { DemandeAccesPorteur } from 'src/porteur-access/domains/demande-acces-porteur';
import { DemandeAccesPorteurIntrouvableError } from 'src/porteur-access/domains/errors/porteur-access.errors';
import {
  DemandeAccesPorteurReader,
  DemandeAccesPorteurWriter,
} from '../ports/demande-acces-porteur.repository';
import type { JournalAudit } from '../ports/services-transverses.port';

/**
 * Prise en charge d'une demande par un instructeur : `soumise → en_examen`.
 *
 * Étape distincte de la décision, et pas seulement cosmétique : elle nomme
 * l'instructeur AVANT que la décision ne soit rendue et évite que deux
 * personnes travaillent le même dossier. Elle ne pose aucune date de décision
 * — instruire n'est pas décider.
 */
@Injectable()
export class InstruireDemandePorteurUseCase {
  constructor(
    private readonly lecture: DemandeAccesPorteurReader,
    private readonly ecriture: DemandeAccesPorteurWriter,
    @Inject(AuditLogService) private readonly audit: JournalAudit,
  ) {}

  async execute(commande: {
    demandeId: string;
    decideurAdminId: number;
    decideurRole: string;
  }): Promise<DemandeAccesPorteur> {
    const demande = await this.lecture.findById(commande.demandeId);
    if (!demande) throw new DemandeAccesPorteurIntrouvableError();

    // Lève `TransitionDemandeInterditeError` (409) si la demande est déjà
    // décidée ou retirée : reprendre en examen un dossier clos n'existe pas.
    demande.prendreEnExamen(commande.decideurAdminId);
    const enregistree = await this.ecriture.enregistrer(demande);

    await this.audit
      .create(
        String(commande.decideurAdminId),
        commande.decideurRole,
        'porteur_access.demande.examen',
        'demande_acces_porteur',
        commande.demandeId,
        undefined,
        undefined,
        { utilisateurId: demande.utilisateurId },
      )
      .catch(() => {});

    return enregistree;
  }
}

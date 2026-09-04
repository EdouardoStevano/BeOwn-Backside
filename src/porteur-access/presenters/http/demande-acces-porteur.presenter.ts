import {
  DemandeAccesPorteur,
  alerteInstructionLe,
  echeanceReponseIndicative,
  instructionEnAlerte,
} from 'src/porteur-access/domains/demande-acces-porteur';
import { libelleMotifRefus } from 'src/porteur-access/domains/motif-refus';

/**
 * Vues exposées d'une demande — contrats du front, distincts du modèle de
 * domaine. Le domaine ne franchit jamais la frontière HTTP : sérialiser
 * `DemandeAccesPorteur` directement publierait sa structure interne et lierait
 * le contrat d'API à un refactor du modèle.
 *
 * DEUX vues, et c'est le point important :
 *  - `versVueDemandeur` — ce que voit la personne : ni l'identifiant de
 *    l'administrateur (tiers), ni le complément interne de l'instructeur ;
 *  - `versVueInstructeur` — la file du back-office, qui les porte tous les
 *    deux, plus les échéances d'engagement de réponse.
 *
 * Une vue unique aurait tôt ou tard fait fuiter le complément interne dans
 * `GET /porteur-access/demandes/me` : la séparation est structurelle, pas
 * documentaire.
 */

/** Vue rendue au DEMANDEUR. */
export interface DemandeAccesPorteurVueDemandeur {
  id: string | null;
  statut: string;
  motivation: string;
  cguVersionAcceptee: string;
  soumiseLe: string;
  decideeLe: string | null;
  /** Code du motif de refus (liste fermée), et son libellé opposable. */
  motifRefus: string | null;
  motifRefusLibelle: string | null;
  /** Échéance indicative annoncée par les CGU (J+30). */
  reponseAttendueAvant: string;
}

/** Vue rendue au BACK-OFFICE. */
export interface DemandeAccesPorteurVueInstructeur extends DemandeAccesPorteurVueDemandeur {
  utilisateurId: number;
  decideurAdminId: number | null;
  /** INTERNE — jamais rendu au demandeur. */
  motifRefusComplement: string | null;
  /** J+25 : à partir de cette date, le dossier doit remonter en alerte. */
  alerteInstructionLe: string;
  enAlerte: boolean;
}

export const versVueDemandeur = (
  demande: DemandeAccesPorteur,
): DemandeAccesPorteurVueDemandeur => ({
  id: demande.id,
  statut: demande.statut,
  motivation: demande.motivation,
  cguVersionAcceptee: demande.cguVersionAcceptee,
  soumiseLe: demande.soumiseLe.toISOString(),
  decideeLe: demande.decideeLe ? demande.decideeLe.toISOString() : null,
  motifRefus: demande.motifRefus,
  motifRefusLibelle: demande.motifRefus
    ? libelleMotifRefus(demande.motifRefus)
    : null,
  reponseAttendueAvant: echeanceReponseIndicative(
    demande.soumiseLe,
  ).toISOString(),
});

export const versVueInstructeur = (
  demande: DemandeAccesPorteur,
  maintenant: Date = new Date(),
): DemandeAccesPorteurVueInstructeur => ({
  ...versVueDemandeur(demande),
  utilisateurId: demande.utilisateurId,
  decideurAdminId: demande.decideurAdminId,
  motifRefusComplement: demande.motifRefusComplement,
  alerteInstructionLe: alerteInstructionLe(demande.soumiseLe).toISOString(),
  enAlerte: instructionEnAlerte(
    { statut: demande.statut, soumiseLe: demande.soumiseLe },
    maintenant,
  ),
});

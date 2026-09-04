import { UserStatus } from 'src/iam/domains/enums/user.enum';
import type { LigneFileDemandesAccesPorteur } from 'src/porteur-access/applications/ports/demande-acces-porteur.repository';
import { compteDecidable } from 'src/porteur-access/domains/acces-porteur';
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

/** Vue rendue au BACK-OFFICE sur UN dossier. */
export interface DemandeAccesPorteurVueInstructeur extends DemandeAccesPorteurVueDemandeur {
  utilisateurId: number;
  decideurAdminId: number | null;
  /** INTERNE — jamais rendu au demandeur. */
  motifRefusComplement: string | null;
  /** J+25 : à partir de cette date, le dossier doit remonter en alerte. */
  alerteInstructionLe: string;
  enAlerte: boolean;
}

/**
 * Une LIGNE de la file d'instruction : le dossier, plus l'état du compte
 * demandeur.
 *
 * Vue distincte de la précédente, et non un champ optionnel de plus : la
 * réponse à un PATCH porte un dossier qu'on vient de décider (l'état du compte
 * y a déjà été éprouvé), la file porte des dossiers qu'on n'a pas encore
 * ouverts — ce n'est pas la même question, ce ne sont pas les mêmes données
 * disponibles.
 */
export interface LigneFileVueInstructeur extends DemandeAccesPorteurVueInstructeur {
  /**
   * Statut du COMPTE demandeur, `null` si la ligne compte a disparu.
   *
   * Sans lui, l'instructeur voyait le dossier d'un compte suspendu et se
   * heurtait à un 409 sur chaque tentative de décision, sans que rien à
   * l'écran n'explique pourquoi.
   */
  statutCompte: string | null;
  /** Raccourci d'affichage du cas le plus fréquent. */
  compteSuspendu: boolean;
  /**
   * Le dossier est-il décidable ? `false` quand le compte n'est plus en
   * relation d'affaires — c'est exactement la garde que le use case oppose
   * (409 `PORTEUR_ACCESS_COMPTE_INACTIF`), rendue lisible AVANT le clic.
   */
  decisionPossible: boolean;
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

export const versLigneFile = (
  ligne: LigneFileDemandesAccesPorteur,
  maintenant: Date = new Date(),
): LigneFileVueInstructeur => ({
  ...versVueInstructeur(ligne.demande, maintenant),
  statutCompte: ligne.statutCompte,
  compteSuspendu: ligne.statutCompte === UserStatus.SUSPENDU,
  decisionPossible: compteDecidable(ligne.statutCompte),
});

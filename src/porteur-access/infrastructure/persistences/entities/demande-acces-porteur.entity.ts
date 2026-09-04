import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutDemandeAccesPorteur } from 'src/porteur-access/domains/demande-acces-porteur';
import { MotifRefusAccesPorteur } from 'src/porteur-access/domains/motif-refus';

/**
 * Demande d'accès porteur — lot 4, décision fondateur D1.
 *
 * Une demande n'est JAMAIS supprimée par l'application : elle est close
 * (acceptée, refusée, retirée) et conservée. C'est la pièce qui prouve que
 * l'attribution de l'accès porteur a fait l'objet d'un examen, comme les CGU
 * l'exigent — et le motif de refus doit rester opposable au demandeur. Seule
 * la purge RGPD (barème de conservation) efface, et elle distingue le TEXTE
 * LIBRE (purgé tôt) du SQUELETTE DE DÉCISION (conservé 5 ans).
 *
 * Table et index posés en dev par le `synchronize` du seed ; SQL manuel pour
 * les environnements déployés (docs/adr/ADR-migrations-hors-deploiement.md).
 */
@Entity('demande_acces_porteur')
// File du back-office : filtre par statut, tri par date de soumission. Sert
// aussi la remontée des dossiers en alerte (J+25) : « les plus anciens encore
// ouverts » se lit sur la tête `statut` puis sur l'ordre de `soumiseLe`.
@Index('IDX_demande_acces_porteur_statut_soumise', ['statut', 'soumiseLe'])
// Même file SANS filtre de statut : le composite ci-dessus ne sert alors pas
// le tri (sa colonne de tête est absente de la requête).
@Index('IDX_demande_acces_porteur_soumise', ['soumiseLe'])
// Purge RGPD par échéance de décision (barème) : sélection sur `decideeLe`.
@Index('IDX_demande_acces_porteur_decidee', ['decideeLe'])
/**
 * UNE SEULE demande non terminale par compte — invariant tenu par la BASE et
 * pas seulement par le use case : sans cet index partiel, deux requêtes
 * concurrentes passeraient toutes deux le contrôle applicatif et ouvriraient
 * deux dossiers. La clause reprend `STATUTS_NON_TERMINAUX` du domaine ; les
 * deux listes doivent rester identiques (un test l'éprouve).
 */
@Index('UQ_demande_acces_porteur_en_cours', ['utilisateurId'], {
  unique: true,
  where: `statut IN ('soumise', 'en_examen')`,
})
export class DemandeAccesPorteurEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Compte demandeur. Référence sans FK dure, comme le reste du schéma. */
  @Column({ type: 'integer' })
  @Index('IDX_demande_acces_porteur_utilisateur')
  utilisateurId: number;

  @Column({ type: 'varchar', default: StatutDemandeAccesPorteur.SOUMISE })
  statut: StatutDemandeAccesPorteur;

  /**
   * Exposé du projet : obligatoire, plafonné à 2 000 caractères (domaine + DTO).
   * TEXTE LIBRE saisi par la personne — donc purgeable indépendamment de la
   * décision (barème : 2 ans après un refus), et jamais recopié dans une
   * notification, un e-mail ou le journal d'audit.
   */
  @Column({ type: 'text' })
  motivation: string;

  /**
   * Version des CGU en vigueur au moment du dépôt, figée depuis une CONSTANTE
   * SERVEUR (`CGU_VERSION_COURANTE`) — jamais depuis le client : ce qui est
   * réputé accepté ne peut pas être choisi par celui qui accepte.
   */
  @Column({ type: 'varchar', length: 20, default: '1.0' })
  cguVersionAcceptee: string;

  @Column({ type: 'timestamptz' })
  soumiseLe: Date;

  /** Horodatage de la décision (ou du retrait). NULL tant qu'elle est ouverte. */
  @Column({ type: 'timestamptz', nullable: true })
  decideeLe: Date | null;

  /**
   * Administrateur auteur de la décision — renseigné dès la PRISE EN CHARGE.
   * Colonne nullable (une demande soumise ou retirée n'en a pas), mais le
   * domaine garantit qu'elle ne l'est JAMAIS sur `acceptee`/`refusee` :
   * engagement CGU « aucune décision entièrement automatisée ».
   */
  @Column({ type: 'integer', nullable: true })
  decideurAdminId: number | null;

  /** Motif CODÉ (liste fermée) communiqué au demandeur. NULL hors refus. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  motifRefus: MotifRefusAccesPorteur | null;

  /**
   * Précision libre de l'instructeur — USAGE INTERNE STRICT : jamais
   * communiquée au demandeur (ni notification, ni export). Purgée avec la
   * motivation à l'échéance du texte libre.
   */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  motifRefusComplement: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

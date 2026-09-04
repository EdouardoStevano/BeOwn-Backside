import { SetMetadata } from '@nestjs/common';

export const AUDIT_SANS_CORPS_KEY = 'audit:sans-corps';

/**
 * Journalise la requête SANS recopier son corps dans `audit_log.metadata`.
 *
 * `AuditInterceptor` conserve par défaut le corps de toute mutation
 * authentifiée. C'est utile pour relire une décision — mais `audit_log` est
 * conservé CINQ ANS, échappe au barème de purge des données de la finalité
 * concernée et n'entre dans aucun export de données personnelles. Y déverser
 * un champ de TEXTE LIBRE écrit par ou sur une personne (motivation d'une
 * demande, commentaire interne d'un instructeur) crée une copie durable, hors
 * de tout contrôle : ni purgeable à l'échéance de sa finalité, ni restituable
 * au titre de l'art. 15.
 *
 * À poser sur toute route dont le corps contient du texte libre nominatif. La
 * trace reste complète pour le reste — acteur, route, statut, durée, objet —
 * et les use cases concernés écrivent en plus leur propre entrée métier, avec
 * des CODES et des états, jamais des phrases.
 */
export const AuditSansCorps = () => SetMetadata(AUDIT_SANS_CORPS_KEY, true);

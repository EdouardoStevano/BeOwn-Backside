import { HttpException, HttpStatus } from '@nestjs/common';
import { IamError } from 'src/iam/domains/errors';
import { statutHttpDeIamError } from 'src/iam/presenters/http/filters/iam-error.filter';
import { PorteurAccessError } from 'src/porteur-access/domains/errors/porteur-access.errors';
import { statutHttpDePorteurAccessError } from 'src/porteur-access/presenters/http/filters/porteur-access-error.filter';
import { PayoutMethodError } from 'src/payments/applications/ports/payout-methods.port';
import { statutHttpDePayoutMethodError } from 'src/payments/presenters/http/payout-method-exception.filter';
import { SignatureProviderUnavailableError } from 'src/common/yousign/signature-provider.error';
import { STATUT_SIGNATURE_INDISPONIBLE } from 'src/common/yousign/signature-provider-exception.filter';
import { ConflitsInteretsError } from 'src/projects/domains/errors/conflits-interets.errors';
import { statutHttpDeConflitsInteretsError } from 'src/projects/presenters/http/filters/conflits-interets-error.filter';

/**
 * Statut HTTP réellement renvoyé au client pour une exception donnée.
 *
 * ## Le défaut corrigé
 *
 * `AuditInterceptor` écrivait `err?.status ?? 500`. Or les erreurs MÉTIER du
 * dépôt ne sont pas des `HttpException` : elles ignorent délibérément HTTP
 * (« le domaine exprime ce qui ne va pas, la présentation choisit le statut »)
 * et sont traduites par un filtre qui s'exécute EN AVAL de l'intercepteur.
 * Résultat mesuré en recette : des 409, 403 et 429 tous journalisés « 500 »
 * dans `audit_log` — conservé cinq ans — alors que le client, lui, recevait
 * les bons codes. Un journal qui ment sur ses propres statuts ne sert plus à
 * rien : il transforme des refus métier normaux en incidents serveur.
 *
 * ## Pourquoi cette forme
 *
 * Chaque famille d'erreurs métier expose désormais, DEPUIS SON FILTRE, la
 * fonction pure qui décide de son statut. Ce module ne fait que les aiguiller
 * par `instanceof`. Il n'existe donc AUCUNE seconde table à maintenir en
 * phase : le filtre et l'audit lisent la même. Un test de non-divergence
 * (`statut-erreur-metier.spec.ts`) rejoue chaque filtre réel et compare.
 *
 * L'alternative — poser un `statutHttp` sur les classes d'erreurs — aurait
 * remis HTTP dans le domaine, exactement ce que ces hiérarchies ont été
 * écrites pour éviter.
 *
 * ## Ajouter une famille
 *
 * Exporter la fonction de statut depuis le filtre, ajouter une ligne ici, et
 * l'entrée correspondante dans le test de non-divergence — lequel échoue si
 * une famille couverte par un filtre est oubliée ici.
 */

/**
 * Aiguillage, du plus spécifique au plus général. Ordonné : `HttpException`
 * en tête, puisque tout ce qui en hérite porte déjà son propre statut.
 */
const RESOLVEURS: ReadonlyArray<(erreur: unknown) => number | undefined> = [
  // Exceptions Nest (y compris celles levées par les contrôleurs et par le
  // gel des avoirs, qui lève une vraie ForbiddenException).
  (e) => (e instanceof HttpException ? e.getStatus() : undefined),
  (e) => (e instanceof IamError ? statutHttpDeIamError(e) : undefined),
  (e) =>
    e instanceof PorteurAccessError
      ? statutHttpDePorteurAccessError(e)
      : undefined,
  (e) =>
    e instanceof PayoutMethodError
      ? statutHttpDePayoutMethodError(e)
      : undefined,
  (e) =>
    e instanceof SignatureProviderUnavailableError
      ? STATUT_SIGNATURE_INDISPONIBLE
      : undefined,
  (e) =>
    e instanceof ConflitsInteretsError
      ? statutHttpDeConflitsInteretsError(e)
      : undefined,
];

/**
 * @param erreur exception levée par le handler
 * @param defaut statut retenu si rien ne la reconnaît — une erreur non
 *   identifiée EST une erreur serveur, et doit continuer de se voir comme
 *   telle dans le journal.
 */
export function statutHttpDeLErreur(
  erreur: unknown,
  defaut: number = HttpStatus.INTERNAL_SERVER_ERROR,
): number {
  for (const resolveur of RESOLVEURS) {
    const statut = resolveur(erreur);
    if (typeof statut === 'number') return statut;
  }

  // Repli historique : certaines erreurs portent un `status` numérique sans
  // hériter d'HttpException (doubles de test, erreurs de bibliothèques).
  const statutBrut = (erreur as { status?: unknown } | null | undefined)
    ?.status;
  if (typeof statutBrut === 'number') return statutBrut;

  return defaut;
}

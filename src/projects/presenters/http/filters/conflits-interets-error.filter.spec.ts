import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { ConflitsInteretsErrorFilter } from './conflits-interets-error.filter';
import {
  DetenteurDePartsDeLaSocieteSupportError,
  PorteurDeSonPropreProjetError,
} from 'src/projects/domains/errors/conflits-interets.errors';

/**
 * Traduction HTTP des refus de conflit d'intérêts.
 *
 * Ce qui compte pour l'appelant : le bon statut, un `code` STABLE — c'est le
 * contrat du front, qui ne doit jamais avoir à lire un message pour décider —
 * et aucune fuite interne dans le corps.
 */
describe('ConflitsInteretsErrorFilter', () => {
  /** Hôte minimal qui capture statut et corps posés par le filtre. */
  const hote = () => {
    const capture: { statusCode?: number; body?: any } = {};
    const response = {
      status: (code: number) => {
        capture.statusCode = code;
        return response;
      },
      json: (body: any) => {
        capture.body = body;
        return response;
      },
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    return { host, capture };
  };

  it('porteur de son propre projet → 403 + code stable', () => {
    const { host, capture } = hote();

    new ConflitsInteretsErrorFilter().catch(
      new PorteurDeSonPropreProjetError('Vous portez ce projet.'),
      host,
    );

    expect(capture.statusCode).toBe(HttpStatus.FORBIDDEN);
    expect(capture.body).toEqual({
      message: 'Vous portez ce projet.',
      error: 'Forbidden',
      statusCode: 403,
      code: 'CONFLIT_INTERETS_PORTEUR_DU_PROJET',
    });
  });

  it('détention préexistante sur la société support → 409 + code stable', () => {
    const { host, capture } = hote();

    new ConflitsInteretsErrorFilter().catch(
      new DetenteurDePartsDeLaSocieteSupportError('Vous détenez déjà des parts.'),
      host,
    );

    expect(capture.statusCode).toBe(HttpStatus.CONFLICT);
    expect(capture.body).toMatchObject({
      error: 'Conflict',
      statusCode: 409,
      code: 'CONFLIT_INTERETS_DETENTION_SOCIETE_SUPPORT',
    });
  });

  it('ne laisse fuir ni trace d’exécution ni nom de classe interne', () => {
    const { host, capture } = hote();
    const erreur = new PorteurDeSonPropreProjetError('Vous portez ce projet.');

    new ConflitsInteretsErrorFilter().catch(erreur, host);

    const corps = JSON.stringify(capture.body);
    expect(corps).not.toContain('stack');
    expect(corps).not.toContain('PorteurDeSonPropreProjetError');
    expect(Object.keys(capture.body!).sort()).toEqual([
      'code',
      'error',
      'message',
      'statusCode',
    ]);
  });
});

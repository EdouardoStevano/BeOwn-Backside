import { EventEmitter } from 'events';
import { protegerDestinationLogs } from './logger.config';

/**
 * Sous saturation, le service MOURAIT sur un `UNKNOWN: unknown error, write`
 * émis par SonicBoom, le flux de sortie de pino : son unique gestionnaire
 * d'erreur par défaut (`filterBrokenPipe`) ne traite qu'EPIPE, se retire et
 * ré-émet le reste — un 'error' ré-émis sans écouteur tue le process.
 *
 * Ces tests figent la règle : un échec d'écriture de log ne tue rien.
 */
describe('destination de logs — un échec d’écriture ne tue pas le process', () => {
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stderr.mockRestore();
  });

  it("n'explose pas quand la destination émet une erreur d'écriture", () => {
    const destination = protegerDestinationLogs(new EventEmitter());

    expect(() =>
      destination.emit('error', new Error('UNKNOWN: unknown error, write')),
    ).not.toThrow();
  });

  it('signale la panne UNE fois sur stderr, sans boucler sur les suivantes', () => {
    const destination = protegerDestinationLogs(new EventEmitter());

    for (let i = 0; i < 50; i += 1) {
      destination.emit('error', new Error('ENOSPC: no space left on device'));
    }

    expect(stderr).toHaveBeenCalledTimes(1);
    expect(String(stderr.mock.calls[0][0])).toContain('ENOSPC');
  });

  it('reste muet et sans exception quand stderr est cassé lui aussi', () => {
    stderr.mockImplementation(() => {
      throw new Error('EBADF: bad file descriptor');
    });
    const destination = protegerDestinationLogs(new EventEmitter());

    expect(() => destination.emit('error', new Error('write'))).not.toThrow();
  });

  it('reste sans écouteur = process mort : le témoin de la régression', () => {
    // Sans le garde, un EventEmitter qui émet 'error' sans écouteur LÈVE.
    // C'est exactement ce que faisait la destination de pino en production.
    const nu = new EventEmitter();
    expect(() => nu.emit('error', new Error('write'))).toThrow();
  });
});

import {
  OrdresOrphelinsCronService,
  DELAI_GRACE_ACCEPTATION_MS,
} from './ordres-orphelins-cron.service';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';

/**
 * Le balayeur ne possède qu'un TRI : quel ordre accepté est réellement
 * orphelin (aucune signature vivante, hors délai de grâce) et part en
 * compensation — laquelle est déléguée au service partagé avec le webhook et
 * le cron d'expiration, seul détenteur des écritures conditionnelles.
 */

const MAINTENANT = new Date('2026-09-01T12:00:00Z');
/** Un instant confortablement au-delà du délai de grâce. */
const ACCEPTE_IL_Y_A_LONGTEMPS = new Date(
  MAINTENANT.getTime() - 2 * DELAI_GRACE_ACCEPTATION_MS,
);

function ordre(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: overrides.id ?? 'ordre-1',
    statut: OrdreMarcheStatus.ACCEPTE,
    vendeurId: 5,
    acheteurId: 9,
    interetNbFractions: 4,
    prixUnitaire: 100,
    accepteLe: ACCEPTE_IL_Y_A_LONGTEMPS,
    ...overrides,
  } as any;
}

function build(options: {
  candidats?: any[];
  signatures?: any[];
  compensationResultat?: { statutOrdre: OrdreMarcheStatus | null; montantLibere: number };
} = {}) {
  const ordreRepo: any = {
    find: jest.fn().mockResolvedValue(options.candidats ?? []),
  };
  const signatureRepo: any = {
    find: jest.fn().mockResolvedValue(options.signatures ?? []),
  };
  const compensation: any = {
    compenserCessionInaboutie: jest.fn().mockResolvedValue(
      options.compensationResultat ?? {
        statutOrdre: OrdreMarcheStatus.INTERET_EXPRIME,
        montantLibere: 400,
      },
    ),
  };
  const notifications: any = { push: jest.fn().mockResolvedValue(undefined) };

  return {
    service: new OrdresOrphelinsCronService(
      ordreRepo,
      signatureRepo,
      compensation,
      notifications,
    ),
    ordreRepo,
    signatureRepo,
    compensation,
    notifications,
  };
}

describe('OrdresOrphelinsCronService', () => {
  it('libère un ordre accepté SANS AUCUNE signature : fonds + annonce, via le service partagé', async () => {
    const h = build({ candidats: [ordre()], signatures: [] });

    const liberes = await h.service.libererOrdresOrphelins(MAINTENANT);

    expect(liberes).toBe(1);
    expect(h.compensation.compenserCessionInaboutie).toHaveBeenCalledWith({
      ordreId: 'ordre-1',
      acheteurId: 9,
      nbFractions: 4,
    });
    // Les deux parties sont prévenues : le vendeur (annonce rendue) et
    // l'acheteur (fonds libérés).
    const destinataires = h.notifications.push.mock.calls.map(
      (appel: any[]) => appel[0].utilisateurId,
    );
    expect(destinataires).toEqual(expect.arrayContaining([5, 9]));
  });

  it('ne cible que les ordres ACCEPTE hors délai de grâce — accepteLe NULL compris', async () => {
    const h = build();

    await h.service.libererOrdresOrphelins(MAINTENANT);

    const where = h.ordreRepo.find.mock.calls[0][0].where;
    expect(where).toHaveLength(2);
    expect(where[0].statut).toBe(OrdreMarcheStatus.ACCEPTE);
    expect(where[1].statut).toBe(OrdreMarcheStatus.ACCEPTE);
  });

  it('laisse tranquille un ordre dont la signature est PENDING : la cession est en attente légitime', async () => {
    const h = build({
      candidats: [ordre()],
      signatures: [{ ordreId: 'ordre-1', statut: SignatureStatus.PENDING }],
    });

    const liberes = await h.service.libererOrdresOrphelins(MAINTENANT);

    expect(liberes).toBe(0);
    expect(h.compensation.compenserCessionInaboutie).not.toHaveBeenCalled();
  });

  it('laisse tranquille un ordre dont la signature est SIGNED : la cession est en cours d’exécution', async () => {
    const h = build({
      candidats: [ordre()],
      signatures: [{ ordreId: 'ordre-1', statut: SignatureStatus.SIGNED }],
    });

    const liberes = await h.service.libererOrdresOrphelins(MAINTENANT);

    expect(liberes).toBe(0);
    expect(h.compensation.compenserCessionInaboutie).not.toHaveBeenCalled();
  });

  it('rattrape un ordre dont TOUTES les signatures sont terminales : la compensation avait échoué', async () => {
    const h = build({
      candidats: [ordre()],
      signatures: [
        { ordreId: 'ordre-1', statut: SignatureStatus.EXPIRED },
        { ordreId: 'ordre-1', statut: SignatureStatus.CANCELLED },
      ],
    });

    const liberes = await h.service.libererOrdresOrphelins(MAINTENANT);

    expect(liberes).toBe(1);
    expect(h.compensation.compenserCessionInaboutie).toHaveBeenCalledTimes(1);
  });

  it('compensation sans effet (ordre déjà libéré par un autre chemin) : aucune notification', async () => {
    const h = build({
      candidats: [ordre()],
      signatures: [],
      compensationResultat: { statutOrdre: null, montantLibere: 0 },
    });

    const liberes = await h.service.libererOrdresOrphelins(MAINTENANT);

    expect(liberes).toBe(0);
    expect(h.notifications.push).not.toHaveBeenCalled();
  });

  /**
   * L'acheteur n'était PAS prévenu quand rien n'avait pu être libéré — c'est
   * pourtant le cas où il en a le plus besoin : sa cession est morte, et si
   * aucun montant n'était réservé, il doit pouvoir vérifier son solde. Le
   * silence laissait l'anomalie invisible de la seule personne concernée.
   */
  it('rien à rendre côté fonds : l’acheteur est prévenu QUAND MÊME, avec un autre message', async () => {
    const h = build({
      candidats: [ordre()],
      signatures: [],
      compensationResultat: {
        statutOrdre: OrdreMarcheStatus.EN_CARNET,
        montantLibere: 0,
      },
    });

    await h.service.libererOrdresOrphelins(MAINTENANT);

    const destinataires = h.notifications.push.mock.calls.map(
      (appel: any[]) => appel[0].utilisateurId,
    );
    expect(destinataires).toEqual(expect.arrayContaining([5, 9]));

    const versAcheteur = h.notifications.push.mock.calls.find(
      (appel: any[]) => appel[0].utilisateurId === 9,
    )[0];
    expect(versAcheteur.titre).toBe('Cession non aboutie');
    expect(versAcheteur.message).toContain('Aucun montant');
    expect(versAcheteur.metadata.montantLibere).toBe(0);
  });

  it('un ordre en échec n’empêche pas la libération des suivants', async () => {
    const h = build({
      candidats: [ordre({ id: 'ordre-ko' }), ordre({ id: 'ordre-ok' })],
      signatures: [],
    });
    h.compensation.compenserCessionInaboutie
      .mockRejectedValueOnce(new Error('base indisponible'))
      .mockResolvedValueOnce({
        statutOrdre: OrdreMarcheStatus.INTERET_EXPRIME,
        montantLibere: 400,
      });

    const liberes = await h.service.libererOrdresOrphelins(MAINTENANT);

    expect(liberes).toBe(1);
  });

  it('aucun candidat : aucune lecture de signatures, aucune écriture', async () => {
    const h = build({ candidats: [] });

    const liberes = await h.service.libererOrdresOrphelins(MAINTENANT);

    expect(liberes).toBe(0);
    expect(h.signatureRepo.find).not.toHaveBeenCalled();
  });
});

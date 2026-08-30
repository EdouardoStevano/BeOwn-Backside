import { SynchroniserLaVerificationUseCase } from './synchroniser-la-verification.usecase';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import { KycMapper } from 'src/compliance/domain/mappers/kyc.mapper';
import {
  KycNiveau,
  KycStatus,
} from 'src/compliance/domain/enums/kyc-status.enum';
import { VerdictIdentite } from 'src/compliance/domain/value-objects/verdict-identite';

const TITULAIRE = 42;

const dossier = (etat: { statut: KycStatus; fournisseurRef?: string | null }) =>
  new InvestorComplianceProfile({
    investorId: TITULAIRE,
    kycCase: KycMapper.restore({
      id: 'kyc-1',
      statut: etat.statut,
      niveau: KycNiveau.STANDARD,
      fournisseur: 'stripeIdentity',
      // `??` serait faux ici : `null` est précisément le cas à éprouver — un
      // dossier ouvert sans qu'aucune session n'ait été démarrée.
      fournisseurRef:
        etat.fournisseurRef === undefined ? 'vs_1' : etat.fournisseurRef,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    adequacy: null,
  });

const sansDossier = () =>
  new InvestorComplianceProfile({
    investorId: TITULAIRE,
    kycCase: null,
    adequacy: null,
  });

function monter(
  etat: {
    profil?: InvestorComplianceProfile;
    session?: {
      sessionId: string;
      url: string;
      status: string;
      motifEchec?: string;
    };
  } = {},
) {
  const profils = {
    findByInvestorId: jest
      .fn()
      .mockResolvedValue(
        etat.profil ?? dossier({ statut: KycStatus.EN_COURS }),
      ),
  };
  const identity = {
    retrieveVerificationSession: jest
      .fn()
      .mockResolvedValue(
        etat.session ?? { sessionId: 'vs_1', url: '', status: 'verified' },
      ),
  };
  const appliquer = {
    execute: jest
      .fn()
      .mockResolvedValue({ issue: 'applique', statut: KycStatus.VALIDE }),
  };

  const useCase = new SynchroniserLaVerificationUseCase(
    profils as never,
    identity as never,
    appliquer as never,
  );

  return { useCase, profils, identity, appliquer };
}

/**
 * La réconciliation existe parce que le webhook n'arrive pas toujours — un
 * poste de développement n'est pas joignable depuis l'extérieur. Ce qu'elle ne
 * doit surtout pas devenir, c'est un second chemin **plus permissif** que le
 * webhook : ces tests éprouvent qu'elle passe par les mêmes transitions.
 */
describe('SynchroniserLaVerificationUseCase', () => {
  it('lit la session du dossier et présente le verdict aux transitions', async () => {
    const { useCase, identity, appliquer } = monter();

    const issue = await useCase.execute(TITULAIRE);

    expect(identity.retrieveVerificationSession).toHaveBeenCalledWith('vs_1');
    expect(appliquer.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        verdict: VerdictIdentite.VERIFIEE,
        utilisateurId: TITULAIRE,
        sessionId: 'vs_1',
      }),
    );
    expect(issue).toMatchObject({ issue: 'verdict-recu', etat: 'verified' });
  });

  it('trace la réconciliation comme telle dans le journal d’audit', async () => {
    // Un identifiant inventé qui ressemblerait à celui du fournisseur rendrait
    // les deux chemins indiscernables après coup.
    const { useCase, appliquer } = monter();

    await useCase.execute(TITULAIRE);

    expect(appliquer.execute).toHaveBeenCalledWith(
      expect.objectContaining({ evenementId: 'reconciliation:vs_1' }),
    );
  });

  it('reprend le motif que le fournisseur donne à son refus', async () => {
    const { useCase, appliquer } = monter({
      session: {
        sessionId: 'vs_1',
        url: '',
        status: 'requires_input',
        motifEchec: 'document_expired',
      },
    });

    await useCase.execute(TITULAIRE);

    expect(appliquer.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        verdict: VerdictIdentite.REVUE_REQUISE,
        motif: 'document_expired',
      }),
    );
  });

  it('ne touche à rien quand le titulaire n’a pas de dossier', async () => {
    const { useCase, identity, appliquer } = monter({ profil: sansDossier() });

    const issue = await useCase.execute(TITULAIRE);

    expect(issue).toEqual({ issue: 'aucun-dossier' });
    expect(identity.retrieveVerificationSession).not.toHaveBeenCalled();
    expect(appliquer.execute).not.toHaveBeenCalled();
  });

  it('ne touche à rien quand aucune session n’a été ouverte', async () => {
    const { useCase, identity } = monter({
      profil: dossier({
        statut: KycStatus.NON_DEMARRE,
        fournisseurRef: null,
      }),
    });

    const issue = await useCase.execute(TITULAIRE);

    expect(issue).toEqual({ issue: 'aucune-session' });
    expect(identity.retrieveVerificationSession).not.toHaveBeenCalled();
  });

  it('ne conclut rien d’une session annulée', async () => {
    // Une session annulée n'apprend rien sur l'identité : elle dit seulement
    // qu'on ne saura pas par ce chemin-là.
    const { useCase, appliquer } = monter({
      session: { sessionId: 'vs_1', url: '', status: 'canceled' },
    });

    const issue = await useCase.execute(TITULAIRE);

    expect(issue).toEqual({ issue: 'sans-verdict', etat: 'canceled' });
    expect(appliquer.execute).not.toHaveBeenCalled();
  });
});

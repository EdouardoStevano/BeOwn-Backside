import { KycCase } from './kyc-case';
import { KycNiveau, KycStatus } from '../enums/kyc-status.enum';
import { KycMapper } from '../mappers/kyc.mapper';
import {
  SuiteDuVerdict,
  VerdictIdentite,
} from '../value-objects/verdict-identite';

const SESSION = 'vs_courante';

const dossier = (statut: KycStatus, fournisseurRef: string | null = SESSION) =>
  KycMapper.restore({
    id: 'kyc-1',
    utilisateurId: 42,
    statut,
    niveau: KycNiveau.STANDARD,
    fournisseur: 'stripeIdentity',
    fournisseurRef,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

/**
 * La machine à états du parcours automatique, éprouvée sans aucun mock.
 *
 * Ces règles vivaient dans `HandleIdentityWebhookUseCase`, sous forme de trois
 * tables statiques et d'une garde recopiée dans chacun des trois traitements :
 * les éprouver demandait de monter un use case, quatre doubles et un faux
 * événement Stripe. Ici, un dossier et un verdict suffisent (§26).
 */
describe('KycCase.accueille — quel verdict s’applique à quel dossier', () => {
  describe('une décision humaine ne se fait jamais écraser', () => {
    // Le fournisseur redélivre ses événements jusqu'à trois jours plus tard,
    // dans le désordre. Sans cette garde, un `VERIFIEE` tardif revalidait un
    // dossier que le RCCI venait de refuser.
    it.each([
      [VerdictIdentite.VERIFIEE],
      [VerdictIdentite.EN_TRAITEMENT],
      [VerdictIdentite.REVUE_REQUISE],
    ])('écarte %s sur un dossier refusé', (verdict) => {
      expect(dossier(KycStatus.REFUSE).accueille(verdict, SESSION)).toBe(
        SuiteDuVerdict.ECARTE,
      );
    });

    it('écarte une nouvelle validation sur un dossier déjà validé ailleurs', () => {
      // Même statut, mais session différente : ce n'est pas une redélivrance,
      // c'est un verdict neuf qui arrive après coup.
      const dejaValide = dossier(KycStatus.VALIDE, 'vs_precedente');

      expect(dejaValide.accueille(VerdictIdentite.VERIFIEE, SESSION)).toBe(
        SuiteDuVerdict.ECARTE,
      );
    });
  });

  describe('les redélivrances sont silencieuses', () => {
    it('reconnaît une validation déjà appliquée pour la même session', () => {
      expect(
        dossier(KycStatus.VALIDE).accueille(VerdictIdentite.VERIFIEE, SESSION),
      ).toBe(SuiteDuVerdict.DEJA_APPLIQUE);
    });

    it('reconnaît une mise en revue déjà appliquée pour la même session', () => {
      expect(
        dossier(KycStatus.EN_REVUE).accueille(
          VerdictIdentite.REVUE_REQUISE,
          SESSION,
        ),
      ).toBe(SuiteDuVerdict.DEJA_APPLIQUE);
    });

    it('reconnaît un traitement en cours sans regarder la session', () => {
      // `EN_TRAITEMENT` ne figure pas dans ses propres statuts amont : sans
      // cette idempotence, une redélivrance banale serait signalée comme un
      // verdict écarté, et alerterait pour rien.
      expect(
        dossier(KycStatus.EN_COURS, 'vs_autre').accueille(
          VerdictIdentite.EN_TRAITEMENT,
          SESSION,
        ),
      ).toBe(SuiteDuVerdict.DEJA_APPLIQUE);
    });
  });

  describe('ce que le parcours autorise', () => {
    it('valide un dossier qui attendait une revue manuelle', () => {
      // Un titulaire dont les pièces étaient illisibles peut recommencer et
      // réussir pendant que son dossier attend le RCCI.
      expect(
        dossier(KycStatus.EN_REVUE, 'vs_precedente').accueille(
          VerdictIdentite.VERIFIEE,
          SESSION,
        ),
      ).toBe(SuiteDuVerdict.A_APPLIQUER);
    });

    it('refuse de faire régresser un dossier en revue vers « en traitement »', () => {
      expect(
        dossier(KycStatus.EN_REVUE).accueille(
          VerdictIdentite.EN_TRAITEMENT,
          SESSION,
        ),
      ).toBe(SuiteDuVerdict.ECARTE);
    });

    it.each([[KycStatus.RENOUVELLEMENT], [KycStatus.EXPIRE]])(
      'traite %s comme un nouveau départ',
      (statut) => {
        // Ces statuts attendent le parcours de re-vérification périodique.
        // Les exclure le bloquerait silencieusement le jour où il sera branché.
        for (const verdict of Object.values(VerdictIdentite)) {
          expect(dossier(statut).accueille(verdict, SESSION)).toBe(
            SuiteDuVerdict.A_APPLIQUER,
          );
        }
      },
    );
  });

  it.each([
    [VerdictIdentite.VERIFIEE, KycStatus.VALIDE],
    [VerdictIdentite.EN_TRAITEMENT, KycStatus.EN_COURS],
    [VerdictIdentite.REVUE_REQUISE, KycStatus.EN_REVUE],
  ])('mène le verdict %s au statut %s', (verdict, statut) => {
    expect(KycCase.statutApres(verdict)).toBe(statut);
  });
});

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { UserPreferencesEntity } from 'src/iam/infrastructure/persistence/entities/user-preferences.entity';
import { MfaMethodEntity } from 'src/iam/infrastructure/persistence/entities/mfa-method.entity';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { DemandeAccesPorteurEntity } from 'src/porteur-access/infrastructure/persistences/entities/demande-acces-porteur.entity';
import {
  RegimeAnonymisation,
  SortDemandeAccesPorteur,
  SortDocument,
  emailAnonymise,
  regimeAnonymisation,
  sortDemandeAccesPorteur,
  sortDocumentUtilisateur,
} from 'src/rgpd/domains/retention-policy';
import { StockageFichiersPort } from 'src/rgpd/applications/ports/stockage-fichiers.port';

export interface RapportAnonymisation {
  statut: 'anonymise' | 'deja_anonymise' | 'introuvable';
  regime?: RegimeAnonymisation;
  /** Lignes `document` supprimées (fichier + enregistrement). */
  documentsSupprimes: number;
  /** Pièces KYC marquées « archivage conservation légale » (non détruites). */
  documentsArchives: number;
  /** Fichiers effectivement détruits chez le fournisseur de stockage. */
  fichiersDistantsSupprimes: number;
}

const RAPPORT_VIDE = (
  statut: RapportAnonymisation['statut'],
): RapportAnonymisation => ({
  statut,
  documentsSupprimes: 0,
  documentsArchives: 0,
  fichiersDistantsSupprimes: 0,
});

/**
 * Anonymisation d'un compte supprimé — périmètre EXACT du barème de
 * conformité (docs/conformite/2026-09-03-baremes-lot2.md §2, dépôt Frontside).
 *
 * Appelée par `DeleteAccountUseCase` APRÈS le soft-delete réussi (et après
 * l'email d'adieu — dernier usage légitime de l'adresse), et rattrapée par le
 * cron de purge RGPD pour tout compte SUPPRIME resté non anonymisé (échec
 * transitoire ou stock antérieur au lot 2).
 *
 * IDEMPOTENTE : `users.anonymiseLe` sert de marqueur — un compte déjà
 * anonymisé est un no-op. IRRÉVERSIBLE : aucune table de correspondance,
 * aucun original conservé hors des données archivées prévues par le barème.
 *
 * Deux régimes (décision PURE, `regimeAnonymisation`) :
 * - PURGE_TOTALE (jamais de KYC engagé, jamais de transaction ni
 *   d'investissement) : identité écrasée aussi, pièces détruites.
 * - ARCHIVAGE_RESTREINT : nom/prénom/date de naissance/nationalité (et
 *   éléments de connaissance client) CONSERVÉS 5 ans post-clôture
 *   (L. 561-12 CMF, art. 17.3.b RGPD) ; pièces KYC marquées « conservation
 *   légale », jamais détruites ici. Écritures comptables et contrats INTACTS
 *   (L. 123-22 C. com., L. 213-1 C. conso) — la disparition des identifiants
 *   directs de la table utilisateur les pseudonymise de fait.
 *
 * Comptes personne morale : les données de la société (profil_pm,
 * bénéficiaires effectifs) suivent le dossier KYC archivé — purgées par le
 * cron à l'échéance des 5 ans, pas ici.
 *
 * Les écritures BASE sont atomiques (une transaction) ; la destruction des
 * fichiers distants a lieu APRÈS commit (best-effort : le port ne lève pas,
 * un fichier déjà absent est un succès — rejouable).
 */
@Injectable()
export class AnonymizeAccountService {
  private readonly logger = new Logger(AnonymizeAccountService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stockage: StockageFichiersPort,
  ) {}

  async anonymiser(userId: number): Promise<RapportAnonymisation> {
    const fichiersASupprimer: string[] = [];
    let rapport: RapportAnonymisation;

    rapport = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(UserEntity, { where: { userId } });
      if (!user) return RAPPORT_VIDE('introuvable');
      if (user.anonymiseLe) return RAPPORT_VIDE('deja_anonymise');

      const regime = regimeAnonymisation(
        await this.detecterObligations(manager, userId),
      );
      const purgeTotale = regime === RegimeAnonymisation.PURGE_TOTALE;

      // ── Pièces rattachées à l'utilisateur (barème §2.3) ───────────────────
      const documents = await manager.find(DocumentEntity, {
        where: { userId },
      });
      let documentsSupprimes = 0;
      let documentsArchives = 0;
      for (const doc of documents) {
        const sort = sortDocumentUtilisateur(doc.type);
        // Sans obligation de conservation (purge totale), le « dossier KYC »
        // n'en est pas un : aucune relation d'affaires n'est née, les pièces
        // partent avec le reste.
        const supprimer =
          sort === SortDocument.SUPPRIMER ||
          (purgeTotale && sort === SortDocument.ARCHIVER_CONSERVATION_LEGALE);

        if (supprimer) {
          await manager.delete(DocumentEntity, { id: doc.id });
          // Les pièces privées stockent l'objectName ; une URL http (pièce
          // publique historique) n'est pas destructible par objectName.
          if (doc.path && !doc.path.startsWith('http')) {
            fichiersASupprimer.push(doc.path);
          }
          documentsSupprimes++;
        } else if (
          sort === SortDocument.ARCHIVER_CONSERVATION_LEGALE &&
          !doc.archiveConservationLegale
        ) {
          await manager.update(
            DocumentEntity,
            { id: doc.id },
            { archiveConservationLegale: true },
          );
          documentsArchives++;
        }
        // SortDocument.CONSERVER : intact (contrats, bulletins, certificats,
        // IFU — délivrables au cocontractant pendant 10 ans).
      }

      // ── Identifiants de connexion et secrets (purge immédiate, §2.2) ─────
      if (user.userEmail) {
        await manager.update(
          UserEmailEntity,
          { userId: user.userEmail.userId },
          { email: emailAnonymise(userId) },
        );
      }
      await manager
        .createQueryBuilder()
        .delete()
        .from(MfaMethodEntity)
        .where('user_id = :userId', { userId })
        .execute();
      await manager.delete(UserPreferencesEntity, { userId });

      // ── Compte utilisateur ────────────────────────────────────────────────
      // La preuve de consentement CGU (cguAccepteesLe/Version/Ip) est
      // volontairement CONSERVÉE, rattachée à l'enregistrement anonymisé
      // (art. 7.1 RGPD, barème ligne 8).
      await manager.update(
        UserEntity,
        { userId },
        {
          password: null,
          socialId: null,
          anonymiseLe: new Date(),
          // firstname est déclaré NOT NULL côté type : l'écrasement passe par
          // la chaîne vide, même effet d'irréversibilité.
          ...(purgeTotale ? { firstname: '', lastname: null } : {}),
        },
      );

      // ── Demandes d'accès porteur (lot 4) ─────────────────────────────────
      // Sans relation d'affaires (purge totale), il n'y a aucun examen à
      // justifier : la demande part avec le reste. Avec obligations, la TRACE
      // de l'examen exigé par les CGU survit — statut, dates, administrateur,
      // motif CODÉ, version des CGU — mais vidée de son TEXTE LIBRE
      // (motivation du demandeur, complément interne de l'instructeur), qui
      // n'a, lui, aucune obligation de conservation propre. Le cron de purge
      // supprimera ensuite la ligne à l'échéance des cinq ans.
      if (
        sortDemandeAccesPorteur(regime) === SortDemandeAccesPorteur.SUPPRIMER
      ) {
        await manager.delete(DemandeAccesPorteurEntity, {
          utilisateurId: userId,
        });
      } else {
        await manager.update(
          DemandeAccesPorteurEntity,
          { utilisateurId: userId },
          { motivation: '', motifRefusComplement: null },
        );
      }

      // ── Profil personne physique ─────────────────────────────────────────
      await manager.update(
        ProfilPPEntity,
        { utilisateurId: userId },
        {
          telephone: null,
          adresseLigne1: null,
          adresseLigne2: null,
          codePostal: null,
          ville: null,
          ...(purgeTotale
            ? {
                civilite: null,
                prenom: '',
                nom: '',
                nomNaissance: null,
                dateNaissance: null,
                lieuNaissance: null,
                paysNaissance: null,
                nationalite: null,
                nif: null,
                profession: null,
                secteurActivite: null,
              }
            : {}),
        },
      );

      return {
        statut: 'anonymise',
        regime,
        documentsSupprimes,
        documentsArchives,
        fichiersDistantsSupprimes: 0,
      };
    });

    // ── Destruction des fichiers distants, hors transaction ────────────────
    for (const objectName of fichiersASupprimer) {
      await this.stockage.delete(objectName);
      rapport = {
        ...rapport,
        fichiersDistantsSupprimes: rapport.fichiersDistantsSupprimes + 1,
      };
    }

    if (rapport.statut === 'anonymise') {
      this.logger.log(
        `Anonymisation RGPD du compte #${userId} : régime ${rapport.regime}, ` +
          `${rapport.documentsArchives} pièce(s) KYC archivée(s) conservation légale, ` +
          `${rapport.documentsSupprimes} document(s) supprimé(s), ` +
          `${rapport.fichiersDistantsSupprimes} fichier(s) distant(s) détruit(s).`,
      );
    }
    return rapport;
  }

  /**
   * Obligations de conservation attachées au compte — la moindre suffit à
   * basculer en archivage restreint (règle « la durée la plus longue
   * l'emporte »).
   */
  private async detecterObligations(manager: EntityManager, userId: number) {
    const kycEngage =
      (await manager.count(KycEntity, {
        where: { utilisateurId: userId, statut: Not(KycStatus.NON_DEMARRE) },
      })) > 0;

    const aInvestissements =
      (await manager.count(InvestmentEntity, {
        where: { utilisateurId: userId },
      })) > 0;

    let aTransactions = false;
    const wallets = await manager.find(WalletEntity, {
      where: { proprietaireUserId: userId },
    });
    if (wallets.length > 0) {
      const walletIds = wallets.map((w) => w.id);
      aTransactions =
        (await manager.count(TransactionEntity, {
          where: [
            { walletSource: In(walletIds) },
            { walletDestination: In(walletIds) },
          ],
        })) > 0;
    }

    return { kycEngage, aTransactions, aInvestissements };
  }
}

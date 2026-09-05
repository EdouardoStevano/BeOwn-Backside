import { Injectable, Logger, Optional } from '@nestjs/common';
import { SignatureProvider } from 'src/signatures/applications/ports/signature-provider.port';
import { FinalizeSignedContractUseCase } from 'src/signatures/applications/usecases/finalize-signed-contract.usecase';

/**
 * Valeurs de statut, chez les prestataires supportés, signifiant que la
 * signature a été RECUEILLIE. Comparées en minuscules : YouSign rend `done`,
 * le provider de repli `signed`.
 */
const STATUTS_FOURNISSEUR_SIGNEE = ['done', 'signed', 'completed'];
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Not, IsNull, Repository } from 'typeorm';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { ExpirerSignatureCessionUseCase } from './usecases/expirer-signature-cession.usecase';

/**
 * Filet de sécurité : expiration des signatures de cession non recueillies.
 *
 * Le seul déclencheur d'expiration était l'événement `signature_request.expired`
 * du prestataire. Un webhook non reçu — panne, abonnement expiré, endpoint
 * désabonné, signature ouverte alors que le prestataire est hors service —
 * laissait donc l'annonce gelée en `accepte` et les fonds de l'acheteur bloqués
 * SANS TERME : aucun chemin interne ne pouvait plus les libérer.
 *
 * Ce balayage ne dépend d'aucun système externe : il lit `expiresAt`, que la
 * plateforme a elle-même posé à l'ouverture de la signature (48 h), et rejoue la
 * MÊME séquence de compensation que le webhook. La transition conditionnelle
 * `PENDING → EXPIRED` garantit qu'un webhook tardif ne libérera pas deux fois.
 */
@Injectable()
export class SignaturesExpiryCronService {
  private readonly logger = new Logger(SignaturesExpiryCronService.name);

  constructor(
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    private readonly expirerSignature: ExpirerSignatureCessionUseCase,
    // Ajoutés en DERNIÈRE position et OPTIONNELS : les suites existantes
    // construisent ce service à la main, et l'absence de l'un ou l'autre doit
    // faire retomber sur le comportement antérieur (expirer), jamais échouer.
    @Optional() private readonly provider?: SignatureProvider,
    @Optional() private readonly finalize?: FinalizeSignedContractUseCase,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async expirerSignaturesEchues(): Promise<number> {
    // Périmètre strictement limité au marché secondaire (`ordreId` non nul) :
    // la souscription initiale a son propre cycle de vie et ne réserve pas de
    // fonds de la même manière.
    const echues = await this.signatureRepo.find({
      where: {
        statut: SignatureStatus.PENDING,
        expiresAt: LessThanOrEqual(new Date()),
        ordreId: Not(IsNull()),
      },
      take: 200,
    });

    if (echues.length === 0) {
      this.logger.debug('CRON signatures-expiry: aucune signature échue');
      return 0;
    }

    let expirees = 0;
    let finalisees = 0;
    for (const signature of echues) {
      try {
        // ÉTAT RÉEL DEMANDÉ AU PRESTATAIRE AVANT D'EXPIRER.
        //
        // Ce balayage se déclenche sur une échéance LOCALE, sans événement
        // externe — précisément parce qu'un webhook peut ne jamais arriver
        // (panne, abonnement expiré, endpoint désabonné). Mais l'inverse est
        // tout aussi possible : la signature a bien été RECUEILLIE et c'est
        // le `signature_request.done` qui s'est perdu. Expirer sans demander,
        // c'est alors annuler une cession que les deux parties ont conclue —
        // et rendre à l'acheteur un argent qu'il vient d'engager.
        //
        // On demande donc. Si le prestataire dit « signée », on FINALISE au
        // lieu d'annuler. S'il ne répond pas, on expire comme avant : c'est le
        // comportement de repli, et il reste le bon quand on ne sait pas.
        if (await this.dejaSignee(signature)) {
          this.logger.warn(
            `CRON signatures-expiry: la signature ${signature.id} est SIGNÉE chez le ` +
              'prestataire (événement perdu) — finalisation au lieu d’expiration.',
          );
          await this.finalize!.execute(signature.youSignRequestId);
          finalisees += 1;
          continue;
        }

        if ((await this.expirerSignature.execute(signature)) === 'expiree') {
          expirees += 1;
        }
      } catch (err: any) {
        // Une signature en échec ne doit pas bloquer la libération des autres.
        this.logger.error(
          `CRON signatures-expiry: échec sur la signature ${signature.id}: ${err?.message}`,
        );
      }
    }

    this.logger.log(
      `CRON signatures-expiry: ${expirees}/${echues.length} signature(s) expirée(s) et compensée(s)` +
        (finalisees > 0
          ? `, ${finalisees} finalisée(s) après relecture chez le prestataire`
          : ''),
    );
    return expirees;
  }

  /**
   * Le prestataire considère-t-il cette signature comme RECUEILLIE ?
   *
   * Rend `false` dès qu'on ne peut pas l'affirmer — prestataire injoignable,
   * port absent, statut inconnu. Ne pas savoir n'est pas « signée » : le repli
   * doit rester l'expiration, qui libère l'annonce et les fonds.
   */
  private async dejaSignee(signature: SignatureEntity): Promise<boolean> {
    if (!this.provider || !this.finalize || !signature.youSignRequestId) {
      return false;
    }
    try {
      const statut = await this.provider.getSignatureRequestStatus(
        signature.youSignRequestId,
      );
      return STATUTS_FOURNISSEUR_SIGNEE.includes(String(statut).toLowerCase());
    } catch (err: any) {
      this.logger.warn(
        `CRON signatures-expiry: état de la signature ${signature.id} indisponible ` +
          `chez le prestataire (${err?.message}) — expiration selon l'échéance locale.`,
      );
      return false;
    }
  }
}

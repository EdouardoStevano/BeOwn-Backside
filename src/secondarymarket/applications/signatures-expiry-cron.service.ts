import { Injectable, Logger } from '@nestjs/common';
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
    for (const signature of echues) {
      try {
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
      `CRON signatures-expiry: ${expirees}/${echues.length} signature(s) expirée(s) et compensée(s)`,
    );
    return expirees;
  }
}

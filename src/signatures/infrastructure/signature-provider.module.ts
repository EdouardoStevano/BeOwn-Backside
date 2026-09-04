import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignatureProvider } from 'src/signatures/applications/ports/signature-provider.port';
import { SignaturesInfrastructureModule } from './signatures-infrastructure.module';
import { SimpleAcknowledgementProvider } from './providers/simple-acknowledgement.provider';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { YouSignModule } from 'src/common/yousign/yousign.module';
import { YouSignService } from 'src/common/yousign/yousign.service';

const PROVIDERS_CONNUS = ['yousign', 'acknowledge'] as const;

/**
 * Câblage du port `SignatureProvider` (DIP).
 *
 * La variable d'environnement `SIGNATURE_PROVIDER` choisit l'adapter au
 * démarrage — `yousign` par défaut, `acknowledge` pour le repli « acceptation
 * certifiée » (YouSign non souscrit). Une valeur inconnue fait ÉCHOUER le boot :
 * un provider de signature choisi par une faute de frappe n'a pas le droit de
 * se replier silencieusement sur un autre.
 */
@Module({
  imports: [
    ConfigModule,
    SignaturesInfrastructureModule,
    TypeOrmModule.forFeature([DocumentEntity]),
    CloudStorageModule,
    YouSignModule,
  ],
  providers: [
    SimpleAcknowledgementProvider,
    {
      provide: SignatureProvider,
      useFactory: (
        config: ConfigService,
        yousign: YouSignService,
        acknowledge: SimpleAcknowledgementProvider,
      ): SignatureProvider => {
        const choix = config.get<string>('SIGNATURE_PROVIDER') ?? 'yousign';
        if (!PROVIDERS_CONNUS.includes(choix as (typeof PROVIDERS_CONNUS)[number])) {
          throw new Error(
            `SIGNATURE_PROVIDER invalide : « ${choix} » (attendu : ${PROVIDERS_CONNUS.join(' | ')})`,
          );
        }
        return choix === 'acknowledge' ? acknowledge : yousign;
      },
      inject: [ConfigService, YouSignService, SimpleAcknowledgementProvider],
    },
  ],
  exports: [SignatureProvider],
})
export class SignatureProviderModule {}

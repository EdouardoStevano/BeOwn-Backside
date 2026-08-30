import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSettingsEntity } from 'src/admin/entities/admin-settings.entity';
import { PlatformFeesService } from './services/platform-fees.service';
import { BAREME_DES_FRAIS_QUERY } from './ports/bareme-des-frais.query';
import { AdminSettingsBaremeQuery } from '../infrastructure/repositories/admin-settings-bareme.query';
import { PublicFeesController } from '../presentation/http/public-fees.controller';

/**
 * Module global exposant PlatformFeesService partout (distributions,
 * projects, marché secondaire…) sans ré-import explicite.
 *
 * Expose aussi un endpoint public (GET /public/platform-fees) consommé
 * par le Frontside pour afficher des taux toujours à jour.
 */
@Global()
/**
 * **Les frais de la plateforme** — les taux qu'elle prélève, et leur calcul.
 *
 * Ce module vivait dans `src/common/platform-fees/`, avec les briques
 * techniques. Ce n'en est pas une : les commissions sont l'argent que BeOwn
 * gagne, et il atterrit dans le wallet `FRAIS_PLATEFORME` — une des cinq
 * bourses que §3.2 confie à `treasury`. Le contexte qui tient la caisse est
 * celui qui doit dire ce qu'on y verse.
 *
 * C'est une **Policy** au sens de §22 : les taux ne sont pas figés dans le
 * code, ils sont configurés par le super-administrateur
 * (`admin_settings.commissions`) et `DEFAULT_FEE_RATES` ne sert que de repli.
 *
 * Trois contextes le consomment — `catalog` (sortie de projet),
 * `secondary-market` (revente) et `distributions` (gestion locative) : ils
 * dépendaient déjà de `treasury` pour créditer ce wallet, ils en dépendent
 * maintenant aussi pour savoir combien.
 *
 * > `round2` n'a pas suivi. C'est de l'arithmétique décimale sans domaine, et
 * > un fichier **domaine** de `secondary-market` l'importait — le laisser ici
 * > aurait fait dépendre ce domaine d'un autre contexte (§27). Il vit
 * > désormais dans `shared/money`, aux côtés de `formatEur`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AdminSettingsEntity])],
  controllers: [PublicFeesController],
  providers: [
    // Le paramétrage est lu par un port : l'entité ORM de `src/admin` et
    // TypeORM ne franchissent plus l'infrastructure (§27, §33).
    { provide: BAREME_DES_FRAIS_QUERY, useClass: AdminSettingsBaremeQuery },
    PlatformFeesService,
  ],
  exports: [PlatformFeesService],
})
export class PlatformFeesModule {}

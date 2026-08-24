import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { YouSignService } from './yousign.service';

/**
 * **Anti-Corruption Layer vers le prestataire de signature électronique**
 * (§20) — YouSign, le « Universign » du cahier des charges.
 *
 * Il vivait dans `src/common/yousign/`, hors du contexte qu'il sert.
 * `DocumentsModule` signalait lui-même l'écart. §3.1 range la signature
 * électronique en **Generic** — achetée, jamais reconstruite — et §20 exige
 * qu'elle entre par un adaptateur : sa place est donc
 * `documents/infrastructure/external-services/`, aux côtés des autres
 * adaptateurs de sortie du contexte.
 *
 * > ⚠️ Le domaine ne doit jamais connaître ce service (§32). Aujourd'hui
 * > `subscription` et `secondary-market` l'appellent depuis leurs use cases pour
 * > ouvrir une procédure de signature — c'est de l'orchestration, admise en
 * > couche application, mais elle passerait mieux par un port de `documents`
 * > que par la classe concrète.
 */
@Module({
  imports: [ConfigModule],
  providers: [YouSignService],
  exports: [YouSignService],
})
export class YouSignModule {}

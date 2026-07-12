import { Global, Module } from '@nestjs/common';
import { HASHING_SERVICE } from './hashing.service';
import { BcryptService } from './bcrypt.service';

/**
 * Fournit l'adapter de hachage une seule fois pour toute l'application.
 * Sans ce module, chaque module qui hache un mot de passe redéclarait son propre
 * binding HASHING_SERVICE → BcryptService, avec le risque qu'ils divergent.
 */
@Global()
@Module({
  providers: [{ provide: HASHING_SERVICE, useClass: BcryptService }],
  exports: [HASHING_SERVICE],
})
export class HashingModule {}

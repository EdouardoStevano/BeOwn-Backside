import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminSettingsEntity } from 'src/admin/entities/admin-settings.entity';
import { BaremeDesFrais } from 'src/treasury/domain/value-objects/bareme-des-frais.vo';
import type { BaremeDesFraisQuery } from 'src/treasury/application/ports/bareme-des-frais.query';

/** La ligne singleton de paramétrage — il n'y en a qu'une, et elle a ce nom. */
const LIGNE_DE_PARAMETRAGE = 'default';

/**
 * Lit les taux de commission dans le paramétrage administrateur.
 *
 * **C'est ici que s'arrête la dépendance à `src/admin`.** L'entité ORM du
 * paramétrage et le `Repository` TypeORM étaient injectés dans un service de la
 * couche application ; ils ne franchissent plus l'infrastructure (§27, §33).
 *
 * Le blob `commissions` est un JSON libre : ses clés peuvent manquer, être
 * nulles, ou porter des noms hérités qu'aucun calcul ne lit plus. C'est
 * `BaremeDesFrais.restore` qui absorbe cette souplesse — cet adaptateur ne fait
 * que lui tendre le blob tel quel, sans le juger.
 */
@Injectable()
export class AdminSettingsBaremeQuery implements BaremeDesFraisQuery {
  constructor(
    @InjectRepository(AdminSettingsEntity)
    private readonly parametrage: Repository<AdminSettingsEntity>,
  ) {}

  async lire(): Promise<BaremeDesFrais> {
    const ligne = await this.parametrage.findOne({
      where: { id: LIGNE_DE_PARAMETRAGE },
    });

    // Aucune ligne, ou aucune section `commissions` : le barème par défaut.
    return BaremeDesFrais.restore(ligne?.settings?.commissions ?? {});
  }
}

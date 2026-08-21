import { RegimeFiscal } from '../enums/regime-fiscal.enum';
import { Spv, SpvSnapshot, SpvSnapshotBrut } from '../spv';

/**
 * Traduit la société de projet entre sa forme d'agrégat et sa forme à plat.
 *
 * `restore` ne rejoue aucun invariant — même règle que {@link ProjectMapper} :
 * on éprouve ce qui entre, pas ce qui est déjà écrit. Ne pas confondre avec
 * `SpvOrmMapper` (infrastructure), qui traduit entre ce snapshot et la ligne
 * TypeORM.
 */
export class SpvMapper {
  static restore(snapshot: SpvSnapshotBrut): Spv {
    return new Spv({
      id: snapshot.id,
      raisonSociale: snapshot.raisonSociale,
      siren: snapshot.siren,
      forme: snapshot.forme,
      capitalSocial:
        snapshot.capitalSocial != null ? Number(snapshot.capitalSocial) : null,
      siegeAdresse: snapshot.siegeAdresse,
      // `select: false` : absent de toutes les lectures qui ne le demandent pas.
      iban: snapshot.iban ?? null,
      dateConstitution: snapshot.dateConstitution,
      statutsPdfUrl: snapshot.statutsPdfUrl,
      regimeFiscal: snapshot.regimeFiscal ?? RegimeFiscal.IS,
      gestionnaireUserId: snapshot.gestionnaireUserId,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    });
  }

  static toSnapshot(spv: Spv): SpvSnapshot {
    return {
      id: spv.id,
      raisonSociale: spv.raisonSociale,
      siren: spv.siren,
      forme: spv.forme,
      capitalSocial: spv.capitalSocial,
      siegeAdresse: spv.siegeAdresse,
      iban: spv.iban,
      dateConstitution: spv.dateConstitution,
      statutsPdfUrl: spv.statutsPdfUrl,
      regimeFiscal: spv.regimeFiscal,
      gestionnaireUserId: spv.gestionnaireUserId,
      createdAt: spv.createdAt,
      updatedAt: spv.updatedAt,
    };
  }
}

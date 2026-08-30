// Aliasé : le domaine a lui aussi un mapper de dossier, qui traduit entre
// l'agrégat et son snapshot. Celui-ci ne fait que la moitié ORM du chemin et
// délègue l'autre.
import { KycMapper as KycDomainMapper } from 'src/onboarding/domain/mappers/kyc.mapper';
import {
  KycCase,
  KycCaseSnapshot,
} from 'src/onboarding/domain/entities/kyc-case';
import { KycEntity } from '../entities/kyc.entity';

/**
 * Traductions entre l'agrégat `KycCase` et sa ligne TypeORM.
 *
 * Ces deux méthodes étaient les deux dernières de `ProfilMapper`, le mapper ORM
 * du contexte Profiles, à côté des profils PP, PM et du questionnaire
 * d'adéquation. Elles n'avaient rien en commun avec eux — ni table, ni agrégat,
 * ni raison de changer (§5 — CCP).
 */
export class KycOrmMapper {
  static toDomain(entity: KycEntity): KycCase {
    return KycDomainMapper.restore({
      id: entity.id,
      statut: entity.statut,
      niveau: entity.niveau,
      scoreRisque: entity.scoreRisque,
      fournisseur: entity.fournisseur,
      fournisseurRef: entity.fournisseurRef,
      valideJusquAu: entity.valideJusquAu,
      motifRefus: entity.motifRefus,
      stripeReportId: entity.stripeReportId,
      identiteExtrait: entity.identiteExtrait,
      pieceIdentiteDeposee:
        entity.pieceIdentiteDeposee as KycCaseSnapshot['pieceIdentiteDeposee'],
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  /**
   * Sens écriture : **seuls les champs dont l'agrégat est propriétaire**.
   *
   * `stripeReportId` et `identiteExtrait` sont relus par `toDomain` mais
   * délibérément absents ici. Ils appartiennent à `updateReportData`, que le
   * webhook Stripe appelle avec les données du rapport de vérification ; les
   * recopier depuis un dossier chargé avant le webhook écraserait ce que
   * celui-ci vient d'écrire. Les laisser `undefined` dit à TypeORM de ne pas
   * toucher à la colonne.
   */
  /**
   * `profileId` est un paramètre, et non un champ du snapshot : la pièce ne le
   * connaît pas. C'est le repository de la racine qui sait à quel dossier elle
   * se rattache, parce que c'est lui qui tient la racine (§6).
   */
  static toEntity(domain: KycCase, profileId: string): KycEntity {
    const snapshot = KycDomainMapper.toSnapshot(domain);
    const entity = new KycEntity();
    // Absent d'un dossier qui vient de naître : l'uuid est généré en base.
    if (snapshot.id) entity.id = snapshot.id;
    entity.profileId = profileId;
    entity.statut = snapshot.statut;
    entity.niveau = snapshot.niveau;
    entity.scoreRisque = snapshot.scoreRisque;
    entity.fournisseur = snapshot.fournisseur;
    entity.fournisseurRef = snapshot.fournisseurRef;
    // Une colonne Postgres `date` se renseigne aussi bien avec la chaîne civile
    // `AAAA-MM-JJ` qu'avec un `Date` — et c'est cette chaîne que le driver rend
    // à la lecture, malgré le type déclaré sur l'entité.
    entity.valideJusquAu = snapshot.valideJusquAu as unknown as Date | null;
    entity.motifRefus = snapshot.motifRefus;
    // Écrite, elle : à la différence du rapport Stripe, la pièce déposée est
    // posée par la racine — c'est le titulaire qui la fournit, pas un webhook —
    // donc la recopier depuis le dossier chargé n'écrase rien.
    entity.pieceIdentiteDeposee =
      snapshot.pieceIdentiteDeposee as KycEntity['pieceIdentiteDeposee'];
    return entity;
  }
}

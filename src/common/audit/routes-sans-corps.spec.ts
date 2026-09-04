import { AUDIT_SANS_CORPS_KEY } from './audit-sans-corps.decorator';
import { ProfileController } from 'src/profiles/presenters/http/profile.controller';
import { BeneficiaireEffectifController } from 'src/profiles/presenters/http/beneficiaire-effectif.controller';
import { ReclamationsController } from 'src/reclamations/presenters/http/reclamations.controller';
import { PayoutMethodsController } from 'src/payments/presenters/http/payout-methods.controller';
import { PorteurController } from 'src/locative-management/presenters/http/porteur.controller';
import { UserController } from 'src/iam/presenters/http/user.controller';

/**
 * Un `@AuditSansCorps()` oublié ne casse rien : la route fonctionne, et son
 * corps part simplement dans un journal conservé CINQ ANS, hors du barème de
 * purge de sa finalité et absent de tout export de données personnelles.
 * Ces assertions lisent la métadonnée réellement posée.
 */
const sansCorpsSurLaClasse = (cible: object): boolean =>
  Reflect.getMetadata(AUDIT_SANS_CORPS_KEY, cible) === true;

const sansCorpsSurLaMethode = (prototype: object, methode: string): boolean =>
  Reflect.getMetadata(
    AUDIT_SANS_CORPS_KEY,
    (prototype as unknown as Record<string, unknown>)[methode] as object,
  ) === true;

describe('routes dont le corps ne doit jamais entrer dans audit_log', () => {
  it.each([
    ['ProfileController — profils PP/PM, KYC, questionnaire', ProfileController],
    ['BeneficiaireEffectifController — identité de tiers', BeneficiaireEffectifController],
    ['ReclamationsController — texte libre', ReclamationsController],
    ['PayoutMethodsController — coordonnées de versement', PayoutMethodsController],
    ['PorteurController — baux, loyers, charges (locataire nominatif)', PorteurController],
  ])('%s', (_libelle, controleur) => {
    expect(sansCorpsSurLaClasse(controleur)).toBe(true);
  });

  it.each([
    ['updateMe', 'PATCH /users/me'],
    ['updateById', 'PATCH /users/:id'],
  ])('UserController.%s (%s)', (methode) => {
    expect(sansCorpsSurLaMethode(UserController.prototype, methode)).toBe(true);
  });

  it("CONTRE-ÉPREUVE : les bascules de préférences gardent leur corps", () => {
    // Sans elle, un `@AuditSansCorps()` posé en portée classe sur
    // UserController passerait ce fichier tout en effaçant du journal des
    // corps qui n'ont rien de personnel — et l'audit y perdrait sa valeur.
    expect(sansCorpsSurLaClasse(UserController)).toBe(false);
    expect(sansCorpsSurLaMethode(UserController.prototype, 'toggleNotifEmail')).toBe(
      false,
    );
  });
});

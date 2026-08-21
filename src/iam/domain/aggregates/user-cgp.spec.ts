import { UserRole } from 'src/iam/domain/enums/user.enum';
import {
  AccesReserveAuCgpError,
  DejaRattacheAUnCgpError,
  RattachementASoiMemeError,
} from 'src/iam/domain/errors/cgp.errors';
import { CodeParrainageCgp } from 'src/iam/domain/value-objects/code-parrainage-cgp.vo';
import { buildUser } from './user.fixture';

const CODE = CodeParrainageCgp.of('CGP-A1B2C3D4');

describe('User — rattachement à un conseiller', () => {
  describe('publierCodeParrainage', () => {
    it('publie le code quand le titulaire est conseiller', () => {
      const conseiller = buildUser({ role: UserRole.CGP });

      conseiller.publierCodeParrainage(CODE);

      expect(conseiller.codeParrainageCgp).toBe('CGP-A1B2C3D4');
    });

    it('remplace le code précédent — un code qui a fuité doit pouvoir être renouvelé', () => {
      const conseiller = buildUser({
        role: UserRole.CGP,
        codeParrainageCgp: 'CGP-00000000',
      });

      conseiller.publierCodeParrainage(CODE);

      expect(conseiller.codeParrainageCgp).toBe('CGP-A1B2C3D4');
    });

    it("refuse le code à un titulaire qui n'est pas conseiller", () => {
      const investisseur = buildUser({ role: UserRole.INVESTISSEUR });

      expect(() => investisseur.publierCodeParrainage(CODE)).toThrow(
        AccesReserveAuCgpError,
      );
      expect(investisseur.codeParrainageCgp).toBeNull();
    });
  });

  describe('rattacherAu', () => {
    it('rattache un titulaire libre', () => {
      const titulaire = buildUser({ userId: 42, cgpId: null });

      expect(titulaire.rattacherAu(7)).toBe(true);
      expect(titulaire.cgpId).toBe(7);
    });

    it('refuse un second conseiller — y compris par la route d’administration', () => {
      const titulaire = buildUser({ userId: 42, cgpId: 7 });

      expect(() => titulaire.rattacherAu(9)).toThrow(DejaRattacheAUnCgpError);
      expect(titulaire.cgpId).toBe(7);
    });

    it('traite un rattachement au même conseiller comme un rejeu, sans erreur', () => {
      const titulaire = buildUser({ userId: 42, cgpId: 7 });

      expect(titulaire.rattacherAu(7)).toBe(false);
      expect(titulaire.cgpId).toBe(7);
    });

    it('refuse de rattacher un titulaire à lui-même', () => {
      const conseiller = buildUser({ userId: 42, role: UserRole.CGP });

      expect(() => conseiller.rattacherAu(42)).toThrow(
        RattachementASoiMemeError,
      );
      expect(conseiller.cgpId).toBeNull();
    });
  });
});

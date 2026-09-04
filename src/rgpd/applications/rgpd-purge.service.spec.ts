import { RgpdPurgeService } from 'src/rgpd/applications/rgpd-purge.service';
import {
  FinalitePurge,
  TAILLE_LOT_PURGE,
} from 'src/rgpd/domains/retention-policy';

/**
 * Le DataSource est simulé (dispatch sur le SQL émis) : on vérifie
 * l'ORCHESTRATION de la purge — finalités couvertes, lots bornés, comptage,
 * suspension sur litige, ordre des suppressions, idempotence de sélection —
 * pas PostgreSQL lui-même (les critères SQL sont éprouvés par la démo sur
 * base dev exigée par la mission).
 */
describe('RgpdPurgeService', () => {
  const MAINTENANT = new Date('2026-09-03T12:00:00.000Z');
  let service: RgpdPurgeService;
  let dataSource: any;
  let manager: any;
  let anonymize: any;
  let stockage: any;

  /** File de réponses par motif SQL — le premier motif qui matche consomme. */
  let reponses: Array<{ motif: RegExp; resultat: unknown[] }>;

  const repondre = (sql: string): unknown[] => {
    const idx = reponses.findIndex((r) => r.motif.test(sql));
    if (idx >= 0) {
      const [{ resultat }] = reponses.splice(idx, 1);
      return resultat;
    }
    // Défaut : aucun éligible, aucun suspendu.
    return /COUNT\(\*\)/.test(sql) ? [{ n: 0 }] : [];
  };

  beforeEach(() => {
    reponses = [];
    manager = { query: jest.fn(async (sql: string) => repondre(sql)) };
    dataSource = {
      query: jest.fn(async (sql: string) => repondre(sql)),
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };
    anonymize = {
      anonymiser: jest.fn().mockResolvedValue({ statut: 'anonymise' }),
    };
    stockage = { delete: jest.fn().mockResolvedValue(undefined) };
    service = new RgpdPurgeService(dataSource, anonymize, stockage);
  });

  const compteur = (rapport: any, finalite: FinalitePurge) =>
    rapport.compteurs.find((c: any) => c.finalite === finalite);

  it('run à vide : les 6 finalités du barème sont couvertes, 0 traité partout', async () => {
    const rapport = await service.purger(MAINTENANT);
    expect(rapport.executeLe).toBe(MAINTENANT.toISOString());
    expect(rapport.compteurs.map((c: any) => c.finalite)).toEqual([
      FinalitePurge.COMPTE_SUPPRIME_A_ANONYMISER,
      FinalitePurge.COMPTE_JAMAIS_ACTIVE,
      FinalitePurge.PROSPECT_INACTIF,
      FinalitePurge.KYC_ECHEANCE_POST_CLOTURE,
      FinalitePurge.NOTIFICATIONS,
      FinalitePurge.JOURNAUX_AUDIT,
    ]);
    expect(rapport.totalTraites).toBe(0);
  });

  it('comptes SUPPRIME non anonymisés → délègue à AnonymizeAccountService', async () => {
    reponses.push({
      motif: /status = 'supprime'[\s\S]*ORDER BY/,
      resultat: [{ userId: 8 }, { userId: 9 }],
    });
    const rapport = await service.purger(MAINTENANT);
    expect(anonymize.anonymiser).toHaveBeenCalledTimes(2);
    expect(anonymize.anonymiser).toHaveBeenCalledWith(8);
    expect(anonymize.anonymiser).toHaveBeenCalledWith(9);
    expect(
      compteur(rapport, FinalitePurge.COMPTE_SUPPRIME_A_ANONYMISER).traites,
    ).toBe(2);
  });

  it("chaque sélection de compte exclut les réclamations ouvertes (suspension litige, NOT EXISTS)", async () => {
    await service.purger(MAINTENANT);
    const selects = dataSource.query.mock.calls
      .map((c: any) => c[0] as string)
      .filter((sql: string) => /SELECT u\."userId"/.test(sql));
    expect(selects.length).toBeGreaterThanOrEqual(4);
    for (const sql of selects) {
      expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM reclamation/);
      expect(sql).toMatch(/'recue','accuse_reception','en_instruction'/);
      expect(sql).toMatch(/LIMIT/);
    }
  });

  it('chaque sélection de compte exclut aussi les comptes GELÉS (suspension gel des avoirs, mission 4)', async () => {
    await service.purger(MAINTENANT);
    const selects = dataSource.query.mock.calls
      .map((c: any) => c[0] as string)
      .filter((sql: string) => /SELECT u\."userId"/.test(sql));
    expect(selects.length).toBeGreaterThanOrEqual(4);
    for (const sql of selects) {
      expect(sql).toMatch(/"avoirsGelesLe" IS NULL/);
    }
  });

  it('les éligibles suspendus pour gel des avoirs sont comptés, journalisés, et JAMAIS traités', async () => {
    reponses.push({
      motif: /COUNT\(\*\)[\s\S]*status = 'supprime'[\s\S]*"avoirsGelesLe" IS NOT NULL/,
      resultat: [{ n: 2 }],
    });
    const rapport = await service.purger(MAINTENANT);
    expect(
      compteur(rapport, FinalitePurge.COMPTE_SUPPRIME_A_ANONYMISER).suspendusGel,
    ).toBe(2);
    // Suspendu ≠ traité : rien n'est anonymisé.
    expect(anonymize.anonymiser).not.toHaveBeenCalled();
  });

  it('les éligibles suspendus pour litige sont comptés et journalisés dans le rapport', async () => {
    reponses.push({
      motif: /COUNT\(\*\)[\s\S]*status = 'supprime'/,
      resultat: [{ n: 3 }],
    });
    const rapport = await service.purger(MAINTENANT);
    expect(
      compteur(rapport, FinalitePurge.COMPTE_SUPPRIME_A_ANONYMISER)
        .suspendusLitige,
    ).toBe(3);
    // Suspendu ≠ traité.
    expect(anonymize.anonymiser).not.toHaveBeenCalled();
  });

  it('comptes jamais activés : suppression atomique, enfants avant le compte', async () => {
    reponses.push({
      motif: /status = 'cree'[\s\S]*ORDER BY/,
      resultat: [{ userId: 21 }, { userId: 22 }],
    });
    const rapport = await service.purger(MAINTENANT);

    expect(compteur(rapport, FinalitePurge.COMPTE_JAMAIS_ACTIVE).traites).toBe(
      2,
    );
    const deletes = manager.query.mock.calls.map((c: any) => c[0] as string);
    const ordre = [
      'DELETE FROM notification',
      'DELETE FROM mfa_methods',
      'DELETE FROM user_preferences',
      'DELETE FROM profil_personne_physique',
      'DELETE FROM user_emails',
      'DELETE FROM users',
    ].map((frag) => deletes.findIndex((sql: string) => sql.includes(frag)));
    // Tous présents…
    expect(ordre.every((i) => i >= 0)).toBe(true);
    // …et le compte est supprimé EN DERNIER.
    expect(Math.max(...ordre)).toBe(
      deletes.findIndex((sql: string) => sql.includes('DELETE FROM users')),
    );
    // Les ids passent en paramètre ANY (jamais concaténés).
    const usersDelete = manager.query.mock.calls.find((c: any) =>
      (c[0] as string).includes('DELETE FROM users'),
    );
    expect(usersDelete[1]).toEqual([[21, 22]]);
  });

  it('prospects inactifs : purge uniquement si AUCUNE donnée liée (gardes SQL)', async () => {
    await service.purger(MAINTENANT);
    const sql = dataSource.query.mock.calls
      .map((c: any) => c[0] as string)
      .find((s: string) => /email_verifie/.test(s) && /SELECT u\."userId"/.test(s));
    expect(sql).toBeDefined();
    for (const table of [
      'kyc',
      'wallet',
      'investissement',
      'document',
      'ordre_marche',
    ]) {
      expect(sql).toContain(`NOT EXISTS (SELECT 1 FROM ${table}`);
    }
    // Jamais un compte back-office.
    expect(sql).toContain(`('investisseur','porteur','cgp')`);
  });

  it('KYC échu post-clôture : détruit pièces archivées + extrait + identité archivée', async () => {
    reponses.push({
      motif: /"anonymiseLe" < \$1[\s\S]*ORDER BY/,
      resultat: [{ userId: 42 }],
    });
    reponses.push({
      motif: /SELECT id, path FROM document/,
      resultat: [
        { id: 'doc1', path: 'beown/kyc/id1' },
        { id: 'doc2', path: 'https://cdn/pub.jpg' },
      ],
    });

    const rapport = await service.purger(MAINTENANT);

    expect(
      compteur(rapport, FinalitePurge.KYC_ECHEANCE_POST_CLOTURE).traites,
    ).toBe(1);
    // Fichier privé détruit chez le fournisseur, l'URL http ignorée.
    expect(stockage.delete).toHaveBeenCalledTimes(1);
    expect(stockage.delete).toHaveBeenCalledWith('beown/kyc/id1');
    // Les deux lignes document tombent (le fichier http n'est plus référencé).
    const docDeletes = dataSource.query.mock.calls.filter((c: any) =>
      (c[0] as string).includes('DELETE FROM document'),
    );
    expect(docDeletes.map((c: any) => c[1])).toEqual([['doc1'], ['doc2']]);
    // Effacements en transaction : kyc, profil, bénéficiaires, users.
    const txSql = manager.query.mock.calls.map((c: any) => c[0] as string);
    expect(txSql.some((s: string) => s.includes('UPDATE kyc'))).toBe(true);
    expect(
      txSql.some((s: string) => s.includes('UPDATE profil_personne_physique')),
    ).toBe(true);
    expect(
      txSql.some((s: string) => s.includes('DELETE FROM beneficiaire_effectif')),
    ).toBe(true);
    expect(
      txSql.some((s: string) =>
        s.includes(`UPDATE users SET firstname = '', lastname = NULL`),
      ),
    ).toBe(true);
  });

  it('notifications : DELETE borné par LIMIT, boucle tant que le lot est plein', async () => {
    // Forme RÉELLE du retour driver pg pour un DML : [rows, rowCount].
    reponses.push({
      motif: /DELETE FROM notification/,
      resultat: [[], TAILLE_LOT_PURGE],
    });
    reponses.push({
      motif: /DELETE FROM notification/,
      resultat: [[], 2],
    });

    const rapport = await service.purger(MAINTENANT);

    expect(compteur(rapport, FinalitePurge.NOTIFICATIONS).traites).toBe(
      TAILLE_LOT_PURGE + 2,
    );
    const notifDeletes = dataSource.query.mock.calls.filter((c: any) =>
      (c[0] as string).includes('DELETE FROM notification'),
    );
    expect(notifDeletes).toHaveLength(2);
    for (const call of notifDeletes) {
      expect(call[0]).toContain('LIMIT');
      expect(call[1][1]).toBe(TAILLE_LOT_PURGE);
    }
  });

  it("journaux d'audit : purge 5 ans, LIMIT présent", async () => {
    reponses.push({
      motif: /DELETE FROM audit_log/,
      resultat: [[], 3],
    });
    const rapport = await service.purger(MAINTENANT);
    expect(compteur(rapport, FinalitePurge.JOURNAUX_AUDIT).traites).toBe(3);
    const call = dataSource.query.mock.calls.find((c: any) =>
      (c[0] as string).includes('DELETE FROM audit_log'),
    );
    expect(call[0]).toContain('LIMIT');
    // Seuil : 5 ans avant « maintenant » (calendaire).
    expect((call[1][0] as Date).toISOString()).toBe(
      '2021-09-03T12:00:00.000Z',
    );
  });

  it('IDEMPOTENCE de sélection : un second run sans nouvel éligible traite 0', async () => {
    reponses.push({
      motif: /status = 'supprime'[\s\S]*ORDER BY/,
      resultat: [{ userId: 8 }],
    });
    const premier = await service.purger(MAINTENANT);
    expect(premier.totalTraites).toBe(1);

    // Les files de réponses sont consommées : tout revient vide, comme en base
    // après traitement (les sélections sont auto-extinctives).
    const second = await service.purger(MAINTENANT);
    expect(second.totalTraites).toBe(0);
  });
});

import { describeAuditAction } from './audit-description';

describe('describeAuditAction', () => {
  it('libellé métier connu (approve retrait)', () => {
    expect(
      describeAuditAction('POST /admin/retraits/12/approve', 'retraits'),
    ).toBe("Approbation d'un retrait");
  });
  it('création projet', () => {
    expect(describeAuditAction('POST /admin/projects', 'projects')).toBe(
      "Création d'un projet",
    );
  });
  it('mise à jour paramètres', () => {
    expect(describeAuditAction('PATCH /admin/settings', 'settings')).toBe(
      'Modification des paramètres',
    );
  });
  it('fallback objetType inconnu', () => {
    expect(describeAuditAction('DELETE /admin/foo/9', 'foo')).toBe(
      'Suppression de « foo »',
    );
  });
  it('ne throw jamais sur entrée dégénérée', () => {
    expect(() => describeAuditAction('', null)).not.toThrow();
  });
});

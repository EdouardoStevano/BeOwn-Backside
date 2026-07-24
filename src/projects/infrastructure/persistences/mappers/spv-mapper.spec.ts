import { ProjectMapper } from './project.mapper';
import { Spv } from '../../../domains/spv';
import { SpvEntity } from '../entities/spv.entity';
import { RegimeFiscal } from '../../../domains/enums/regime-fiscal.enum';

describe('ProjectMapper.spv* (roundtrip)', () => {
  const baseSpv: Spv = Object.assign(new Spv(), {
    id: '11111111-1111-1111-1111-111111111111',
    raisonSociale: 'SCI Test',
    siren: '123456789',
    forme: 'SCI',
    capitalSocial: 500_000,
    siegeAdresse: '1 rue X',
    iban: null,
    dateConstitution: new Date('2026-01-01'),
    statutsPdfUrl: 'https://x/statuts.pdf',
    regimeFiscal: RegimeFiscal.IS,
    gestionnaireUserId: 42,
    createdAt: new Date('2026-01-02'),
    updatedAt: new Date('2026-01-02'),
  });

  it('preserves all legacy fields', () => {
    const entity = ProjectMapper.spvToEntity(baseSpv);
    const back = ProjectMapper.spvToDomain(entity);
    expect(back.raisonSociale).toBe('SCI Test');
    expect(back.siren).toBe('123456789');
    expect(back.forme).toBe('SCI');
    expect(back.siegeAdresse).toBe('1 rue X');
  });

  it('preserves equity-locatif fields', () => {
    const entity = ProjectMapper.spvToEntity(baseSpv);
    const back = ProjectMapper.spvToDomain(entity);
    expect(back.dateConstitution).toEqual(baseSpv.dateConstitution);
    expect(back.statutsPdfUrl).toBe('https://x/statuts.pdf');
    expect(back.regimeFiscal).toBe(RegimeFiscal.IS);
    expect(back.gestionnaireUserId).toBe(42);
  });

  it('converts capitalSocial decimal string to number', () => {
    const entity = ProjectMapper.spvToEntity(baseSpv);
    (entity as any).capitalSocial = '500000.00';
    const back = ProjectMapper.spvToDomain(entity);
    expect(typeof back.capitalSocial).toBe('number');
    expect(back.capitalSocial).toBe(500_000);
  });

  it('handles legacy Spv with null equity fields', () => {
    const legacy: Spv = Object.assign(new Spv(), {
      ...baseSpv,
      dateConstitution: null,
      statutsPdfUrl: null,
      gestionnaireUserId: null,
    });
    const entity = ProjectMapper.spvToEntity(legacy);
    const back = ProjectMapper.spvToDomain(entity);
    expect(back.dateConstitution).toBeNull();
    expect(back.statutsPdfUrl).toBeNull();
    expect(back.gestionnaireUserId).toBeNull();
  });
});

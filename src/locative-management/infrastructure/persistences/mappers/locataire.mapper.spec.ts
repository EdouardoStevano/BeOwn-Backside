import { LocataireMapper } from './locataire.mapper';
import { Locataire } from '../../../domains/locataire';

describe('LocataireMapper', () => {
  it('roundtrip preserves fields', () => {
    const d: Locataire = Object.assign(new Locataire(), {
      id: 'aaa',
      nomComplet: 'Jean Dupont',
      email: 'j@d.com',
      telephone: '+22507000000',
      spvId: 'spv-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const e = LocataireMapper.toEntity(d);
    const back = LocataireMapper.toDomain(e);
    expect(back.nomComplet).toBe('Jean Dupont');
    expect(back.email).toBe('j@d.com');
    expect(back.spvId).toBe('spv-1');
  });

  it('handles null email and telephone', () => {
    const d: Locataire = Object.assign(new Locataire(), {
      id: 'aaa',
      nomComplet: 'X',
      email: null,
      telephone: null,
      spvId: 's',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const back = LocataireMapper.toDomain(LocataireMapper.toEntity(d));
    expect(back.email).toBeNull();
    expect(back.telephone).toBeNull();
  });
});

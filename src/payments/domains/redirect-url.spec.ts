import {
  estRedirectionAutorisee,
  normaliserOrigine,
  resoudreUrlRedirection,
} from './redirect-url';

const ALLOWLIST = ['https://app.beown.fr', 'https://admin.beown.fr'];

describe('normaliserOrigine', () => {
  it('réduit une URL complète à son origine', () => {
    expect(normaliserOrigine('https://app.beown.fr/dashboard?x=1#y')).toBe(
      'https://app.beown.fr',
    );
  });

  it('conserve le port, qui fait partie de l’origine', () => {
    expect(normaliserOrigine('http://localhost:5173/')).toBe(
      'http://localhost:5173',
    );
  });

  it('rejette les schémas hors http/https', () => {
    expect(normaliserOrigine('javascript:alert(1)')).toBeNull();
    expect(normaliserOrigine('data:text/html,<script>')).toBeNull();
    expect(normaliserOrigine('file:///etc/passwd')).toBeNull();
  });

  it('rejette ce qui n’est pas une URL absolue', () => {
    expect(normaliserOrigine('/dashboard/portfolio')).toBeNull();
    expect(normaliserOrigine('')).toBeNull();
    expect(normaliserOrigine(undefined)).toBeNull();
  });
});

describe('estRedirectionAutorisee', () => {
  it('accepte une URL de l’allowlist, chemin et requête libres', () => {
    expect(
      estRedirectionAutorisee(
        'https://app.beown.fr/dashboard/portfolio?connect=done',
        ALLOWLIST,
      ),
    ).toBe(true);
  });

  it('refuse un domaine qui SUFFIXE une origine autorisée', () => {
    // Le piège classique d'un contrôle par `startsWith`.
    expect(
      estRedirectionAutorisee('https://app.beown.fr.evil.com/phish', ALLOWLIST),
    ).toBe(false);
  });

  it('refuse un sous-domaine non déclaré', () => {
    expect(
      estRedirectionAutorisee('https://evil.app.beown.fr/', ALLOWLIST),
    ).toBe(false);
  });

  it('refuse le même hôte en schéma dégradé', () => {
    expect(estRedirectionAutorisee('http://app.beown.fr/', ALLOWLIST)).toBe(
      false,
    );
  });

  it('refuse un port différent', () => {
    expect(estRedirectionAutorisee('https://app.beown.fr:8443/', ALLOWLIST)).toBe(
      false,
    );
  });

  it('refuse une origine étrangère', () => {
    expect(estRedirectionAutorisee('https://evil.com/beown', ALLOWLIST)).toBe(
      false,
    );
  });

  it('ignore les entrées de configuration invalides sans élargir l’allowlist', () => {
    expect(
      estRedirectionAutorisee('https://evil.com', ['', 'pas-une-url', null as any]),
    ).toBe(false);
  });
});

describe('resoudreUrlRedirection', () => {
  const DEFAUT = 'https://app.beown.fr/dashboard/portfolio?connect=done';

  it('retient la valeur demandée quand elle est autorisée', () => {
    const cible = 'https://app.beown.fr/autre-retour';
    expect(resoudreUrlRedirection(cible, DEFAUT, ALLOWLIST)).toEqual({
      url: cible,
      refusee: false,
    });
  });

  it('retombe sur le défaut en l’absence de valeur, sans marquer de refus', () => {
    expect(resoudreUrlRedirection(undefined, DEFAUT, ALLOWLIST)).toEqual({
      url: DEFAUT,
      refusee: false,
    });
  });

  it('retombe sur le défaut ET marque le refus pour une origine étrangère', () => {
    expect(
      resoudreUrlRedirection('https://evil.com/steal', DEFAUT, ALLOWLIST),
    ).toEqual({ url: DEFAUT, refusee: true });
  });

  it('ne renvoie jamais une URL non http(s), même en repli', () => {
    const { url } = resoudreUrlRedirection(
      'javascript:alert(document.cookie)',
      DEFAUT,
      ALLOWLIST,
    );
    expect(url).toBe(DEFAUT);
  });
});

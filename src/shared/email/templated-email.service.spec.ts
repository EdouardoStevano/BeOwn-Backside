import { TemplatedEmailService } from './templated-email.service';
import type { EmailTemplateService } from './email-template.service';

/** Transport de test : il retient ce qu'on lui demande d'envoyer. */
class TransportEspion extends TemplatedEmailService {
  readonly envois: Array<{ to: string; subject: string; html: string }> = [];

  constructor(templates: EmailTemplateService) {
    super(templates, 'https://app.beown.fr', 'https://app.beown.fr');
  }

  protected sendHtml(to: string, subject: string, html: string): Promise<void> {
    this.envois.push({ to, subject, html });
    return Promise.resolve();
  }
}

const templatesQuiRendent = (rendu: { sujet: string; html: string } | null) =>
  ({
    render: jest.fn().mockResolvedValue(rendu),
  }) as unknown as EmailTemplateService & { render: jest.Mock };

describe('TemplatedEmailService — réinitialisation du mot de passe', () => {
  it('envoie le template rendu quand il est disponible', async () => {
    const templates = templatesQuiRendent({
      sujet: 'Réinitialisation de votre mot de passe BeOwn',
      html: '<html>rendu</html>',
    });
    const transport = new TransportEspion(templates);

    await transport.sendPasswordResetEmail('lea@exemple.fr', 'jeton-123');

    expect(transport.envois).toHaveLength(1);
    expect(transport.envois[0]).toMatchObject({
      to: 'lea@exemple.fr',
      subject: 'Réinitialisation de votre mot de passe BeOwn',
      html: '<html>rendu</html>',
    });
  });

  it('passe le lien et la durée de validité au template', async () => {
    const templates = templatesQuiRendent({ sujet: 'x', html: 'y' });
    const transport = new TransportEspion(templates);

    await transport.sendPasswordResetEmail('lea@exemple.fr', 'jeton-123');

    expect(templates.render).toHaveBeenCalledWith(
      'password-reset',
      expect.objectContaining({
        resetLink: 'https://app.beown.fr/auth/reset-password?token=jeton-123',
        expiresIn: '30 minutes',
      }),
    );
  });

  /**
   * La garantie qui justifie ce fichier : les autres emails renoncent en
   * silence quand leur template est désactivé au back-office. Celui-ci ne le
   * peut pas — c'est le seul chemin de récupération d'un compte, et ne pas
   * l'envoyer enfermerait dehors quelqu'un qui a perdu son mot de passe.
   */
  describe('template indisponible (désactivé au back-office, ou absent)', () => {
    it('envoie quand même', async () => {
      const transport = new TransportEspion(templatesQuiRendent(null));

      await transport.sendPasswordResetEmail('lea@exemple.fr', 'jeton-123');

      expect(transport.envois).toHaveLength(1);
    });

    it('porte le lien de réinitialisation, non échappé', async () => {
      const transport = new TransportEspion(templatesQuiRendent(null));

      await transport.sendPasswordResetEmail('lea@exemple.fr', 'jeton-123');

      expect(transport.envois[0].html).toContain(
        'href="https://app.beown.fr/auth/reset-password?token=jeton-123"',
      );
    });

    it('reste dans la charte : layout, logo et mention légale', async () => {
      const transport = new TransportEspion(templatesQuiRendent(null));

      await transport.sendPasswordResetEmail('lea@exemple.fr', 'jeton-123');

      const html = transport.envois[0].html;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('class="logo"');
      expect(html).toContain('class="footer"');
    });

    it('garde le sujet attendu par le destinataire', async () => {
      const transport = new TransportEspion(templatesQuiRendent(null));

      await transport.sendPasswordResetEmail('lea@exemple.fr', 'jeton-123');

      expect(transport.envois[0].subject).toBe(
        'Réinitialisation de votre mot de passe BeOwn',
      );
    });
  });
});

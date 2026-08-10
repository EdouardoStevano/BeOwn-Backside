import { emailVerifiedPage } from './email-verified.view';

// Couverture reprise de l'ancien spec de VerifyEmailService, qui vérifiait le
// contenu du HTML rendu par `confirmEmail`. Le rendu ayant quitté la couche
// application, l'assertion suit la vue.
describe('emailVerifiedPage', () => {
  it("rend la page de confirmation avec l'adresse vérifiée", () => {
    const html = emailVerifiedPage('user@example.com');

    expect(html).toContain('Email vérifié avec succès');
    expect(html).toContain('user@example.com');
  });
});

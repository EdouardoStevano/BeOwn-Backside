import QRCode from 'qrcode';

/**
 * QR code d'enrôlement TOTP — **aide au développement local uniquement**.
 *
 * L'URI `otpauth://` rendue par `POST /auth/mfa/enroll` n'est pas affichable
 * dans Postman ni dans un terminal : sans écran pour la dessiner, impossible de
 * l'ajouter à une application authenticator. Ce message la transforme en image
 * et l'envoie dans la boîte du compte, où Mailpit l'affiche.
 *
 * L'image est une `data:` URI. La plupart des clients de messagerie réels les
 * bloquent (Gmail les retire) — sans importance ici, ce message n'est jamais
 * censé sortir d'un poste de dev, et c'est précisément pourquoi son envoi est
 * verrouillé derrière `TOTP_QR_EMAIL` et refusé en production.
 *
 * Le secret figure aussi en clair, pour la saisie manuelle quand l'image ne
 * s'affiche pas. C'est assumé et c'est la raison du bandeau d'avertissement :
 * un secret TOTP dans une boîte email n'a rien à faire ailleurs qu'en local.
 */
export const totpQrHtml = async (
  uri: string,
  secret: string,
): Promise<string> => {
  const qrDataUri = await QRCode.toDataURL(uri, {
    width: 240,
    margin: 1,
    color: { dark: '#1A2E35', light: '#FFFFFF' },
  });

  return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1A2E35; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">BeOwn</h1>
          </div>
          <div style="background-color: #ffffff; padding: 40px 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <div style="background-color: #FDECEA; border-left: 4px solid #D93025; padding: 12px 16px; border-radius: 4px; margin-bottom: 28px;">
              <p style="color: #8B1A12; font-size: 13px; margin: 0; line-height: 1.5;">
                <strong>Environnement de développement.</strong> Ce message contient un secret d'authentification en clair et ne doit jamais être envoyé depuis un environnement réel.
              </p>
            </div>
            <h2 style="color: #333; margin-top: 0;">Votre QR code d'authentification</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Scannez ce code avec votre application authenticator (Google Authenticator, Authy, 1Password…), puis confirmez l'enrôlement avec le code à six chiffres qu'elle affichera.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px; display: inline-block;">
                <img src="${qrDataUri}" alt="QR code d'enrôlement TOTP" width="240" height="240" style="display: block; width: 240px; height: 240px;">
              </div>
            </div>
            <p style="color: #666; font-size: 15px; line-height: 1.6;">
              Si l'image ne s'affiche pas, ajoutez le compte à la main avec cette clé :
            </p>
            <div style="text-align: center; margin: 20px 0;">
              <div style="background-color: #FFF8EC; border: 1px solid #FFB52E; border-radius: 12px; padding: 18px 20px; display: inline-block; min-width: 260px;">
                <span style="color: #1A2E35; font-size: 20px; font-weight: bold; letter-spacing: 3px; word-break: break-all; line-height: 1.4;">
                  ${secret}
                </span>
              </div>
            </div>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              Le facteur reste inactif tant que POST /auth/mfa/enable ne l'a pas confirmé.
            </p>
          </div>
        </div>
      `;
};

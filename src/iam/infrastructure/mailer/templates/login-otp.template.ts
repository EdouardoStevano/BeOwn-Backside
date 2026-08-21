/**
 * Rend la durée lisible plutôt que brute : « 30 secondes » se lit bien, « 300
 * secondes » beaucoup moins. `OTP_TTL` étant configurable, la mise en forme
 * suit la valeur au lieu de supposer laquelle est en vigueur.
 */
const humanizeTtl = (ttlSeconds: number): string => {
  if (ttlSeconds < 60) return `${ttlSeconds} secondes`;

  const minutes = Math.round(ttlSeconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
};

/**
 * Code de connexion à usage unique.
 *
 * Même charpente que `email-verification.template.ts` — bandeau `#1A2E35`,
 * carte blanche bordée, accent `#FFB52E`, pied de page discret — pour que les
 * deux messages du parcours d'authentification se ressemblent. Ce qui change,
 * c'est l'objet de l'attention : là où la vérification pousse vers un bouton,
 * celui-ci met le code au centre, assez grand et assez espacé pour être
 * recopié d'un coup d'œil depuis un téléphone.
 */
export const loginOtpHtml = (otp: string, ttlSeconds: number): string => `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1A2E35; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">BeOwn</h1>
          </div>
          <div style="background-color: #ffffff; padding: 40px 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Votre code de vérification</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Saisissez ce code pour terminer votre connexion à BeOwn.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <div style="background-color: #FFF8EC; border: 1px solid #FFB52E; border-radius: 12px; padding: 22px 20px; display: inline-block; min-width: 260px;">
                <span style="color: #1A2E35; font-size: 34px; font-weight: bold; letter-spacing: 10px; line-height: 1;">
                  ${otp}
                </span>
              </div>
            </div>
            <p style="color: #666; font-size: 15px; line-height: 1.6; text-align: center;">
              Ce code expire dans <strong style="color: #1A2E35;">${humanizeTtl(ttlSeconds)}</strong>.
            </p>
            <p style="color: #999; font-size: 14px; line-height: 1.6;">
              Passé ce délai, demandez-en un nouveau depuis l'écran de connexion. Ne communiquez ce code à personne : aucun membre de l'équipe BeOwn ne vous le demandera.
            </p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              Si vous n'êtes pas à l'origine de cette connexion, ignorez cet email et changez votre mot de passe.
            </p>
          </div>
        </div>
      `;

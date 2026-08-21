/**
 * Page de confirmation servie par `GET /auth/email/verify`. Purement
 * présentation :
 * elle vivait dans `VerifyEmailService` (couche application), qui rendait donc
 * du HTML en plus d'orchestrer la vérification du token (§12.5).
 */
export const emailVerifiedPage = (email: string): string => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `
        <!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email vérifié - BeOwn</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(rgba(26, 46, 53, 0.85), rgba(26, 46, 53, 0.85)),
                  url('https://images.unsplash.com/photo-1564013799919-ab600027ffc6?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80');
      background-size: cover;
      background-position: center;
      background-attachment: fixed;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 40px;
      padding: 50px 40px;
      text-align: center;
      max-width: 450px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .icon {
      width: 80px;
      height: 80px;
      background: #1A2E35;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 25px;
    }
    .icon svg {
      width: 45px;
      height: 45px;
      fill: white;
    }
    h1 {
      color: #1f2937;
      font-size: 28px;
      margin-bottom: 15px;
    }
    p {
      color: #6b7280;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 30px;
    }
    .btn {
      display: inline-block;
      background: #FFB52E;
      color: white;
      text-decoration: none;
      padding: 15px 40px;
      border-radius: 20px;
      font-size: 16px;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }
    .title{
        font-size : 50px;
        color: #1A2E35;
    }
    .email {
      color: #667eea;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    </div>
    <h1 class="title">BeOwn</h1>
    <h1>Email vérifié avec succès !</h1>
    <p>
      Votre adresse email <span class="email">${email}</span> a été vérifiée avec succès.
      Vous pouvez maintenant vous connecter à votre compte BeOwn.
    </p>
    <a href="${frontendUrl}/auth/login" class="btn">Se connecter</a>
  </div>
</body>
</html>
      `;
};

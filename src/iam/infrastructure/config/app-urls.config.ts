import { registerAs } from '@nestjs/config';

/**
 * URLs publiques de l'application. Regroupées ici pour que les couches domaine
 * et application n'aient jamais à lire `process.env` : elles reçoivent une
 * configuration typée.
 */
export default registerAs('appUrls', () => ({
  api: process.env.API_URL ?? 'http://localhost:3001',
  frontend: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  admin: process.env.ADMIN_URL ?? 'http://localhost:5174',
}));

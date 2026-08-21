export * from './iam.error';
export * from './account.errors';
export * from './authentication.errors';
export * from './email-verification.errors';
export * from './otp.errors';
export * from './mfa.errors';
export * from './cgp.errors';
export * from './preferences.errors';
// Dossier réglementaire de l'investisseur — arrivé avec Profiles, qui portait
// son propre socle (`ProfilesError`), fondu ici pour la même raison que celui
// des préférences : un contexte n'a qu'un vocabulaire d'erreurs.
export * from './champ-profil.errors';
export * from './profil-pp.errors';
export * from './profil-pm.errors';
export * from './profile.errors';
export * from './user-administration.errors';
export * from './compte.errors';

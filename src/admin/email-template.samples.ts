import { formatEur } from 'src/common/money/format-eur';

/**
 * Données d'exemple par clé de template, pour la prévisualisation et l'envoi
 * de test de l'API admin (V2-T2). Les noms de variables reproduisent
 * EXACTEMENT les contextes réellement passés à EmailTemplateService.render()
 * par les transports (voir nodemailer.service.ts / brevo.service.ts) ET les
 * variables déclarées dans les .hbs (src/common/email/templates). Les montants
 * (prix, montant) sont pré-formatés comme en production — le rendu ne les
 * reformate pas, il n'interpole que la chaîne fournie.
 *
 * Structure extensible : ajouter une entrée ici couvre une nouvelle clé sans
 * toucher au controller (les clés absentes retombent sur un objet vide).
 */
export const EMAIL_TEMPLATE_SAMPLES: Record<string, Record<string, unknown>> = {
  activation: { otp: '482913', expiresIn: '5 minutes' },
  'two-factor': { otp: '739204', expiresIn: '5 minutes' },
  'kyc-validated': { prenom: 'Awa', appUrl: 'https://app.beown.fr' },
  'kyc-rejected': {
    prenom: 'Awa',
    motif: 'Documents non conformes',
    appUrl: 'https://app.beown.fr',
  },
  'new-project': {
    prenom: 'Awa',
    titre: 'Résidence Horizon',
    ville: 'Saint-Denis',
    triCible: 8,
    url: 'https://beown.fr/projets/exemple',
    unsubscribeUrl: 'https://beown.fr/desinscription?token=exemple',
  },
  'ouverture-reservation': {
    prenom: 'Awa',
    titre: 'Résidence Horizon',
    ville: 'Saint-Denis',
    dateOuverture: '15 août 2026',
    dateCloture: '30 septembre 2026',
    url: 'https://beown.fr/projets/exemple',
    unsubscribeUrl: 'https://beown.fr/desinscription?token=exemple',
  },
  'new-secondary': {
    prenom: 'Awa',
    titre: 'Résidence Horizon',
    nbFractions: 12,
    prix: formatEur(150),
    appUrl: 'https://app.beown.fr',
  },
  echeance: {
    prenom: 'Awa',
    projetTitre: 'Résidence Horizon',
    montant: formatEur(1250),
    date: '15 août 2026',
  },
  'depot-confirmed': { prenom: 'Awa', montant: formatEur(5000) },
  'retrait-processed': { prenom: 'Awa', montant: formatEur(2000) },
};

/**
 * Libellé humain de l'événement qui déclenche chaque email — affiché dans le
 * back-office pour que l'admin sache QUAND part chaque template. Clé absente
 * → chaîne vide (jamais bloquant).
 */
export const TRIGGER_EVENTS: Record<string, string> = {
  activation: "Inscription : envoi du code OTP d'activation du compte",
  'two-factor': 'Connexion avec double authentification (2FA)',
  'kyc-validated': "Validation de la vérification d'identité (KYC)",
  'kyc-rejected': "Refus de la vérification d'identité (KYC)",
  'new-project': "Passage d'un projet en collecte (diffusion à la base)",
  'ouverture-reservation':
    "Publication d'un projet en annonce : ouverture des réservations (diffusion à la base)",
  'new-secondary': 'Nouvelle annonce sur le marché secondaire',
  echeance: 'Échéance de paiement à venir sur un investissement',
  'depot-confirmed': 'Dépôt crédité sur le portefeuille',
  'retrait-processed': 'Demande de retrait prise en charge',
};

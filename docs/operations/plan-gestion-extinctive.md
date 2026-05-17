# Plan de Gestion Extinctive (Run-off) — BeOwn

> Obligation réglementaire PSFP : décrire la procédure de continuation des remboursements aux investisseurs en cas d'arrêt d'activité de la plateforme.

## Objectif

Garantir que les investisseurs continuent de percevoir leurs intérêts et le remboursement de leur capital même en cas de cessation d'activité de BeOwn.

## Procédure en cas d'arrêt d'activité

### 1. Notification (J+0)
- Email à tous les investisseurs actifs
- Bannière permanente sur la plateforme
- Communication à l'AMF/ACPR sous 48h

### 2. Gel des nouvelles activités (J+1 à J+7)
- Désactivation de toute nouvelle souscription (projets passent en BROUILLON)
- Désactivation du marché secondaire pour les nouvelles annonces
- Les retraits restent autorisés sans restriction

### 3. Transfert vers gestionnaire extinctif (J+7 à J+30)
**Option A — Solution interne** : maintenance minimale par une équipe restreinte (1-2 personnes) pour 24 mois max.
**Option B — Solution externalisée** : transférer la gestion à un prestataire spécialisé (ex : Capsens Run-off ~290€/mois).

### 4. Continuation des remboursements (J+30 → fin de tous les investissements)
- Le CRON `EcheancesCronService` continue de tourner quotidiennement
- L'admin endpoint `POST /admin/echeances/:id/pay` reste opérationnel
- Les notifications continuent d'être envoyées aux investisseurs
- Les retraits sont traités sous 48h

## Données critiques à sauvegarder

| Donnée | Fréquence backup | Localisation |
|---|---|---|
| Base de données PostgreSQL | Quotidien | Stockage offsite chiffré |
| Documents (contrats, bulletins, IFU) | Quotidien | Stockage offsite chiffré |
| Wallets Stripe | Continu (Stripe) | Stripe direct |
| Code source | À chaque commit | GitHub privé |

## Exports d'urgence (à pouvoir générer en 1h)

- Liste complète des investisseurs actifs (avec IBAN si vérifié) → CSV
- Liste complète des projets en cours avec échéancier restant → CSV
- Solde des wallets investisseurs → CSV
- Documents par investisseur (zip) → S3 export

## Tests de continuité

- Test annuel de restauration depuis backup (RTO < 4h, RPO < 24h)
- Test annuel de génération des exports d'urgence
- Audit de conformité PRA/PCA

## Contacts d'urgence

- Stripe support entreprise : [à compléter]
- Avocat conformité AMF : [à compléter]
- Hébergeur : [à compléter]
- DPO : [à compléter]

## Révision

Ce document est révisé annuellement et après chaque modification majeure de l'architecture.

Dernière révision : 2026-05-15

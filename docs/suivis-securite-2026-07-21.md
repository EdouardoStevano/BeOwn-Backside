# Suivis sécurité & config prod — 2026-07-21

Document de suivi des actions restantes après la vérification de l'audit sécurité
et les corrections associées (branche `fix/security-hardening`).

## 1. Actions de configuration production (EXTERNES — à faire par l'équipe)

### 1.1 Rotation du mot de passe Gmail (hygiène — NON urgent)
- **Statut réel** : le `.env` du Backside **n'est PAS suivi par git** (gitignoré, ligne 40 de `.gitignore`) et `.env.example` ne contient que des placeholders. Le mot de passe n'est donc **pas exposé dans l'historique git**.
- **Recommandé** : révoquer l'ancien mot de passe d'application Gmail dans le compte Google, en générer un nouveau, mettre à jour le `.env` local/déploiement. À faire car le secret a pu être manipulé en clair localement.
- Action : compte Google → Sécurité → Mots de passe des applications.

### 1.2 Abonnement du webhook Stripe Identity
- Dans le **Dashboard Stripe** → Developers → Webhooks → l'endpoint de l'API, abonner les événements :
  - `identity.verification_session.verified`
  - `identity.verification_session.processing`
  - `identity.verification_session.requires_input`
- Utiliser le même `STRIPE_WEBHOOK_SECRET` que celui du `.env`. Sans cet abonnement, la validation KYC automatique (machine à états livrée au chantier onboarding) ne reçoit pas les événements.

### 1.3 Migration Redis / @keyv/redis
- **Problème** : `cache-manager` v7 ignore les options legacy `cache-manager-ioredis` et retombe en cache mémoire (Keyv in-memory). Conséquence : OTP, cooldowns et codes OAuth ne survivent pas à un redémarrage et ne sont pas partagés entre instances.
- Symptôme dans le code : `redis-cache.service.ts` — le chemin GETDEL atomique via le client Redis brut n'est jamais emprunté (`(cacheManager as any).store` est `undefined` en v7), on retombe sur `get`+`del` non atomique.
- **À faire** : migrer vers `@keyv/redis` (câbler un store Redis réel dans `app.module`) puis restaurer/valider le GETDEL atomique. Ticket à prioriser.

## 2. Suivis sécurité (corrections livrées + reste)

### Corrigé (branche `fix/security-hardening`, revues APPROVED)
- **OTP legacy** : `Math.random()` → `crypto.randomInt` (`otp-impl.service.ts`). L'OTP d'inscription était déjà sûr.
- **Webhook YouSign** : `SIGNED` posé uniquement après exécution atomique (transaction + verrou signature, rollback = renvoi rejouable).
- **Investissement + top-up** : création/complément atomiques (transaction + verrous pessimistes projet & wallet, re-check sous verrou) — anti-sur-vente et anti-double-débit.
- **OAuth state/CSRF** : `CookieOAuthStateStore` (cookie httpOnly lié à l'initiateur + HMAC + TTL) branché sur les 3 stratégies ; erreurs de compilation levées.

### Reste à traiter (non bloquant)
- **YouSign** : le webhook renvoie 200 même en cas d'échec → YouSign ne re-livre pas. Ajouter un rejet non-2xx sur erreur transitoire, ou un **cron de réconciliation** des signatures restées `PENDING`.
- **YouSign** : cas « investissement introuvable » marque `SIGNED` silencieusement → logguer/alerter au lieu de consommer la signature.
- **YouSign** : branche marché secondaire sans tests de régression (failed-exec-leaves-PENDING + toutes écritures sur `em`).
- **Investissement** : s'assurer que le **front envoie toujours l'`idempotencyKey`** sur l'appel investir (sinon deux soumissions rapides sans clé créent deux investissements distincts). Tout **futur chemin d'insertion d'investissement** (conversion de réservation, admin…) doit prendre le verrou projet, sinon il peut survendre.

## 3. Verdict de la vérification d'audit (pour mémoire)

**Confirmées & corrigées** : atomicité investissement, webhook YouSign, OTP legacy Math.random.
**Déjà adressées par le WIP** : OAuth state (CookieOAuthStateStore), Cloudinary (upload `authenticated` + public_id seul persisté).
**Faux positifs sur le code actuel** : brouillons publics (toutes les routes `@Public` filtrent les statuts), XSS admin `ProjectDetail:908` (texte JSX échappé ; le seul `dangerouslySetInnerHTML` assainit via allowlist), bruteforce 500/reCAPTCHA (sign-in = 10/15 min, aucune clé reCAPTCHA en k8s), révocation de session au reset (déjà faite).
**Atténué** : routes `/test/*` de notification (chargées seulement si `ENABLE_TEST_ENDPOINTS=true`, flag absent des manifests k8s).

## 4. État build / repos
- Backside : compile (`nest build` OK) après correction des 5 erreurs du WIP iam/OAuth. DB dev reseedée (scénario EUR).
- Chantier euro-comms mergé dans `develop` (3 repos, synchronisé origine).
- Branche `fix/security-hardening` poussée (3 commits sécurité). PR : `develop...fix/security-hardening`.

# Runbook de lancement — BeOwn

**Date** : 2026-08-29
**Auteur** : ingénieur DevOps (lot 12 du chantier « prêt au lancement »)
**Destinataire** : le fondateur. Ce document suppose que vous savez ouvrir un terminal et suivre une consigne, pas que vous connaissez Kubernetes.
**Documents liés** : [`checklist-mise-en-service.md`](./checklist-mise-en-service.md) · [`plan-gestion-extinctive.md`](./plan-gestion-extinctive.md) · [`../testing/environnement-local.md`](../testing/environnement-local.md)

---

## 0. Comment lire ce document

Chaque étape est écrite sur le même moule :

- **Précondition** — ce qui doit être vrai avant de commencer. Si ce n'est pas vrai, l'étape échouera ou, pire, réussira à moitié.
- **Action** — la commande exacte, ou l'écran exact du prestataire, dans l'ordre.
- **Vérification** — comment savoir que c'est fait. Une étape sans preuve de succès est une étape non faite.
- **Rollback** — comment revenir en arrière. Quand il n'y a pas de retour en arrière possible, c'est écrit noir sur blanc.

Trois marqueurs sont utilisés :

> **DANGER** — action destructive ou irréversible. Ne jamais l'exécuter sans avoir lu la ligne de rollback en entier.

> **CONSTAT** — un fait mesuré dans le dépôt le 2026-08-29, avec le fichier et la ligne. Ce n'est pas une opinion.

> **NON VÉRIFIÉ** — je n'ai pas pu l'exécuter depuis le poste de développement. Vous serez le premier à l'exécuter ; prévoyez du temps.

### Ce qui a été vérifié pour écrire ce document

Outils confrontés au poste de travail le 2026-08-29 :

| Outil | Constat |
|---|---|
| `node` | v24.18.0 — présent |
| `npm` | 11.16.0 — présent |
| `docker` | 29.6.2 — présent |
| `kubectl` | v1.36.1, Kustomize v5.8.1 embarqué — présent |
| `stripe` (CLI) | 1.40.9 — présent |
| `openssl` | 3.5.4 — présent |
| `git` | 2.52.0 — présent |
| `psql`, `pg_dump`, `pg_restore` | présents mais **hors PATH** : `C:\Program Files\PostgreSQL\18\bin\` |
| `helm` | **absent du poste** — requis pour l'observabilité (étape 8) |
| `gh` (GitHub CLI) | **absent du poste** — les webhooks GitHub se posent alors à la main dans l'interface |
| `mimirtool` | **absent du poste** — requis pour charger les règles d'alerte (étape 8) |

Tout ce qui s'exécute sur le serveur (SSH, `kubectl` contre le cluster réel, `helm`) n'a **pas** pu être joué depuis le poste : ces commandes sont marquées NON VÉRIFIÉ. Elles sont écrites d'après les fichiers du dépôt, pas d'après une exécution.

---

## 1. Carte du système

### 1.1 Les trois applications

| Application | Dépôt GitHub | Image Docker | Déploiement k8s |
|---|---|---|---|
| API (NestJS) | `EdouardoStevano/BeOwn-Backside` | `ravikazaha/beown-backside` | `deployment/beown-backend`, port 8080 |
| Front investisseur (React/Vite) | `EdouardoStevano/BeOwn-Frontside` | `ravikazaha/beown-frontside` | `deployment/beown-frontend`, port 80 |
| Back-office Admin (React/Vite) | `EdouardoStevano/BeOwn-backoffice-ADMIN` | `ravikazaha/beown-frontside-admin` | `deployment/beown-frontend-admin`, port 8081 |

### 1.2 Environnements et branches

Source : `Jenkinsfile` (Backside, l.67-72), `Jenkinsfile` (Frontside, l.78-83), `Jenkinsfile` (Admin, stage `Deploy to *`).

| Branche | Environnement | Namespace | URLs | Confirmation manuelle |
|---|---|---|---|---|
| `develop` | dev | `beown-dev` | `dev.beown.fr`, `admin-dev.beown.fr`, `api-dev.beown.fr` | non |
| `staging` | staging | `beown-staging` | `staging.beown.fr`, `admin-staging.beown.fr`, `api-staging.beown.fr` | non |
| `test` | test | `beown-test` | `*-test.beown.fr` | non — **API seulement**, aucun front n'a d'overlay `test` |
| `main` | production | `beown` | `beown.fr`, `admin.beown.fr`, `api.beown.fr` | API oui, Front oui, **Admin non** |

> **CONSTAT** — la confirmation manuelle de production est **désactivée dans l'Admin** : `BeOwn - Admin/Jenkinsfile:227` porte la ligne `// input message: "Déployer ... en production ?"` en commentaire. Un build de `main` sur ce dépôt déploie donc directement en production, sans demander. À rétablir avant toute ouverture (voir étape 6.5).

### 1.3 Ce que le dépôt contient — et ce qu'il ne contient pas

| Brique | Présente ? | Où |
|---|---|---|
| Manifests API (Deployment, Service, HPA, ConfigMap, Postgres, Redis) | oui | `k8s/base/`, `k8s/overlays/{dev,staging,test,production}/` |
| Manifests fronts | oui | `BeOwn - Frontside/BeOwn/k8s/`, `BeOwn - Admin/k8s/` |
| Secrets k8s | **template seulement** | `k8s/base/secrets.example.yaml` — jamais de vraie valeur en dépôt |
| Observabilité (Alloy, règles d'alerte) | oui, **non déployée** | `k8s/monitoring/` |
| **Ingress / routage HTTP public** | **NON** | aucun fichier `Ingress` dans les trois dépôts |
| **Certificats TLS / cert-manager** | **NON** | aucun manifeste |
| **Sauvegarde de la base** | **NON** | aucun `CronJob`, aucun script |
| **PodDisruptionBudget, NetworkPolicy en dev/staging** | partiel | une seule `NetworkPolicy`, pour le namespace `beown` (`k8s/monitoring/networkpolicy.yaml`) |

> **CONSTAT** — l'exposition publique (`api.beown.fr` → service `beown-backend-service:8080`) et le TLS ne sont dans aucun dépôt. Ils existent forcément sur le serveur, hors Git. C'est le premier angle mort du dispositif : personne ne peut reconstruire l'accès public à partir du code seul. Étape 7.

### 1.4 Ordre d'exécution recommandé

Les étapes 2 à 9 sont ordonnées par dépendance. On ne saute pas une étape parce qu'elle paraît administrative.

```
2. Comptes et accès prestataires
   └─ 3. Secrets et variables d'environnement
        ├─ 4. Stripe (compte, clés, webhooks, Connect)
        ├─ 5. Courriel et SMS
        └─ 6. Base de données (schéma, sauvegarde, restauration)   <-- point de blocage connu
             └─ 7. CI/CD Jenkins + webhooks GitHub
                  └─ 8. Domaines et TLS
                       └─ 9. Observabilité et alertes
                            └─ 10. Rollback (à répéter à blanc AVANT d'en avoir besoin)
                                 └─ checklist-mise-en-service.md
```

---

## 2. Comptes et accès prestataires

**Précondition** : aucune. C'est le point de départ.

À posséder, avec l'authentification à deux facteurs activée sur chacun, et les identifiants dans un gestionnaire de mots de passe (jamais dans un fichier du dépôt) :

| Prestataire | À quoi il sert dans le code | Obligatoire au lancement |
|---|---|---|
| GitHub | dépôts, déclenchement des builds | oui |
| Docker Hub (compte `ravikazaha`) | publication des trois images | oui |
| Jenkins (`jenkins.beown.fr`) | construction et déploiement | oui |
| Fournisseur du serveur (Google Cloud, hôte Debian) | cluster k3s, accès SSH | oui |
| Registrar / DNS de `beown.fr` | domaines et certificats | oui |
| **Stripe** | paiements, retraits, KYC Identity | oui — étape 4 |
| Fournisseur SMTP (Gmail applicatif, ou Brevo) | tous les courriels transactionnels | oui — étape 5 |
| Cloudinary | stockage des images et documents | oui — variables déjà présentes en ConfigMap |
| Yousign | signature électronique des bulletins | oui si la souscription est ouverte |
| Twilio | SMS (OTP, diffusions) | non — le driver retombe sur `log` sans identifiants |
| Google reCAPTCHA | protection de l'inscription | oui en production (voir étape 3.4) |
| Google Cloud Console / LinkedIn / Meta | connexion sociale | oui si les boutons OAuth restent affichés |
| Grafana Cloud (région UE) | métriques, logs, traces, alertes | recommandé — étape 9 |
| Sentry (région UE) | erreurs applicatives | recommandé |

**Vérification** : vous pouvez vous connecter à chacun de ces comptes depuis un navigateur, seul, sans demander un mot de passe à quelqu'un.

**Rollback** : sans objet.

---

## 3. Variables d'environnement et secrets

### 3.1 Comment la configuration arrive dans l'application

Trois couches, dans cet ordre de priorité effective :

1. `k8s/base/configmap.yaml` — valeurs communes, **en clair dans Git**. Jamais de secret ici.
2. `k8s/overlays/<env>/configmap-patch.yaml` — surcharges par environnement (URLs, `NODE_ENV`).
3. `Secret` `beown-backend-secrets` — créé **hors Git**, par vos soins, dans chaque namespace.

Le Deployment charge les deux par `envFrom` (`k8s/base/deployment.yaml`, section `envFrom`). Une variable absente des trois n'existe pas pour l'application.

### 3.2 Tableau exhaustif de `.env.example`

Colonne « Source » : `ConfigMap` = à mettre dans le ConfigMap (valeur non sensible) ; `Secret` = à mettre dans le Secret k8s ; `Prestataire` = la valeur vient du tableau de bord d'un tiers.

| Variable | Obligatoire | Source du secret | Conséquence si absente |
|---|---|---|---|
| `DATABASE_HOST` | oui | ConfigMap (`postgres-service`) | l'API ne démarre pas |
| `DATABASE_PORT` | oui | ConfigMap (`5432`) | l'API ne démarre pas |
| `DATABASE_USERNAME` | oui | Secret | l'API et le StatefulSet Postgres ne démarrent pas |
| `DATABASE_PASSWORD` | oui | Secret | idem |
| `DATABASE_DB` | oui | ConfigMap (`beown`) | idem |
| `REDIS_HOST` | oui | ConfigMap (`redis-service`) | limitation de débit, cache et OTP dégradés ; l'inscription peut ne pas aboutir |
| `REDIS_PORT` | oui | ConfigMap (`6379`) | idem |
| `TRUST_PROXY_HOPS` | oui en prod | ConfigMap (`1`) | derrière l'ingress, tous les clients partagent le même seau de limitation : un seul visiteur peut bloquer la connexion de tous |
| `PROJECT_SHARE_SECRET` | oui | Secret (32 octets aléatoires) | les liens de partage de projet ne se signent plus |
| `JWT_SECRET` | oui | Secret | aucune connexion possible. **Le changer déconnecte tout le monde** |
| `JWT_TOKEN_AUDIENCE` | oui | ConfigMap (URL de l'API) | jetons rejetés |
| `JWT_TOKEN_ISSUER` | oui | ConfigMap (URL de l'API) | jetons rejetés |
| `JWT_ACCESS_TOKEN_TTL` | non | ConfigMap (`3600`) | défaut du code |
| `JWT_REFRESH_TOKEN_TTL` | non | ConfigMap (`86400`) | défaut du code |
| `JWT_TOKEN_EMAIL_TTL` | non | ConfigMap (`86400`) | les liens de vérification d'adresse changent de durée de vie |
| `OTP_TTL` | non | ConfigMap (`300`) | durée du code à usage unique |
| `MAX_ATTEMPTS` | non | ConfigMap (`5`) | nombre d'essais du code |
| `MAIL_DRIVER` | **oui en prod** | ConfigMap (`nodemailer`) | vide = automatique : `nodemailer` si `NODE_ENV` vaut development/staging/production. En production le comportement est correct, mais **le laisser explicite** évite toute surprise |
| `MAILPIT_URL` | non | — | inutile hors poste local |
| `MAIL_HOST` | oui | ConfigMap (`smtp.gmail.com`) | aucun courriel ne part |
| `MAIL_PORT` | oui | ConfigMap (`587`) | idem |
| `MAIL_USER` | oui | Secret / Prestataire | idem |
| `MAIL_USER_PASSWORD` | oui | Secret / Prestataire | idem — sur Gmail, un **mot de passe d'application**, pas le mot de passe du compte |
| `MAIL_FROM` | oui | ConfigMap | expéditeur incohérent, courriels classés en indésirables |
| `MAIL_FROM_NAME` | non | ConfigMap (`BeOwn`) | nom d'expéditeur vide |
| `BREVO_API_KEY` | non | Secret / Prestataire | seulement si `MAIL_DRIVER=brevo` |
| `BREVO_SENDER_EMAIL` | non | ConfigMap | idem |
| `BREVO_SENDER_NAME` | non | ConfigMap | idem |
| `SMS_DRIVER` | non | ConfigMap | vide = `twilio` si `NODE_ENV=production`. Sans identifiants Twilio complets, repli automatique sur `log` (aucun SMS ne part, pas d'erreur bloquante) |
| `TWILIO_ACCOUNT_SID` | non | Secret / Prestataire | pas de SMS |
| `TWILIO_AUTH_TOKEN` | non | Secret / Prestataire | pas de SMS |
| `TWILIO_PHONE_NUMBER` | non | ConfigMap | pas de SMS |
| `STRIPE_SECRET_KEY` | **oui** | Secret / Prestataire | `getOrThrow` : **l'API refuse de démarrer** (`stripe-payment.service.ts:16`) |
| `STRIPE_WEBHOOK_SECRET` | **oui** | Secret / Prestataire | `getOrThrow` à la réception du webhook : tout événement Stripe est rejeté en 400, aucun dépôt n'est crédité (`stripe-payment.service.ts:72`) |
| `OAUTH_STATE_SECRET` | non | Secret | repli sur `JWT_SECRET` ; utile pour isoler la protection CSRF du flux OAuth |
| `GOOGLE_CLIENT_ID` | oui si OAuth Google | Secret / Prestataire | bouton Google non fonctionnel |
| `GOOGLE_CLIENT_SECRET` | oui si OAuth Google | Secret / Prestataire | idem |
| `GOOGLE_CALLBACK_URL` | oui si OAuth Google | ConfigMap (overlay) | idem |
| `LINKEDIN_CLIENT_ID` | oui si OAuth LinkedIn | Secret / Prestataire | bouton LinkedIn non fonctionnel |
| `LINKEDIN_CLIENT_SECRET` | oui si OAuth LinkedIn | Secret / Prestataire | idem |
| `LINKEDIN_CALLBACK_URL` | oui si OAuth LinkedIn | ConfigMap (overlay) | idem |
| `FACEBOOK_APP_ID` | **oui** | Secret / Prestataire | la stratégie `passport-facebook` est **chargée au démarrage du module IAM** : sans ces variables, le démarrage est à risque. Renseigner au minimum des valeurs syntaxiquement valides |
| `FACEBOOK_APP_SECRET` | **oui** | Secret / Prestataire | idem |
| `FACEBOOK_CALLBACK_URL` | **oui** | ConfigMap (overlay) | idem |
| `PORT` | oui | ConfigMap (`8080`) | le Service et les sondes visent 8080 ; une autre valeur casse les probes |
| `FRONTEND_URL` | **oui** | ConfigMap (overlay) | CORS refuse le front, les liens des courriels pointent nulle part, l'onboarding Stripe Connect revient sur une URL invalide |
| `TFA_APP_NAME` | **oui** | ConfigMap (`BeOwn`) | `getOrThrow` sur l'enrôlement TOTP (`totp-secret.service.ts:75-76`) : la double authentification échoue. `MFA_APP_NAME` est le nouveau nom, `TFA_APP_NAME` reste accepté |
| `TOTP_QR_EMAIL` | non | ConfigMap (`false`) | doit rester `false` hors poste local : le message transporte le secret en clair. Ignoré si `NODE_ENV=production` |
| `MFA_LOGO_URL` | non | ConfigMap | vignette du compte dans l'application d'authentification |
| `TFA_SECRET_ENCRYPTION_KEY` | **oui** | Secret | clé de chiffrement des secrets TOTP. **Absente du template `secrets.example.yaml`** — voir 3.4. Sans elle, repli silencieux sur `JWT_SECRET` ; si `JWT_SECRET` change ensuite, **tous les seconds facteurs deviennent illisibles** (`aes-gcm-secret-cipher.adapter.ts:65-72`) |
| `PLAFOND_INVESTISSEMENT_NON_AVERTI_EUR` | non | ConfigMap | **variable morte** : aucune lecture dans `src/`. Le plafond réel est codé en dur (`create-investment.usecase.ts:172`). La modifier ne change rien |
| `PLAFOND_INVESTISSEMENT_AVERTI_EUR` | non | ConfigMap | **variable morte**, même constat |
| `KYC_PROVIDER` | non | ConfigMap | **variable morte** : aucune lecture dans `src/`. Le choix Stripe Identity est câblé dans le code |
| `LOG_LEVEL` | non | ConfigMap (`info`, **`warn` en production**) | verbosité des journaux. **`warn` est le réglage de production** : mesuré en charge, passer de `info` à `warn` divise le p95 par ~4 — à `info`, chaque requête écrit une ligne JSON sérialisée puis rédigée (redaction RGPD), et l'écriture est sur le chemin de la réponse. Posé dans `k8s/overlays/production/configmap-patch.yaml`. Ne pas remonter à `info` en production sans raison précise et sans le redescendre ensuite ; pour investiguer, préférer les traces (Tempo) et Sentry, qui ne coûtent rien au p95 |
| `PG_POOL_MAX` | non | ConfigMap (`10`) | taille du pool de connexions PostgreSQL **par pod**. Règle à tenir : `maxReplicas` du HPA × `PG_POOL_MAX` ≤ `max_connections` de PostgreSQL, marge comprise pour l'administration, les sauvegardes et le cron. Aujourd'hui 6 × 10 = 60, sous le défaut de 100. Monter l'un des deux termes oblige à revérifier l'autre |
| `THROTTLE_SHORT_TTL` / `THROTTLE_SHORT_LIMIT` | non | ConfigMap (`1000` / `500`) | filet global de débit, fenêtre courte. Une valeur non entière ou ≤ 0 **fait échouer le démarrage du pod** |
| `THROTTLE_MEDIUM_TTL` / `THROTTLE_MEDIUM_LIMIT` | non | ConfigMap (`60000` / `2000`) | filet global de débit, fenêtre d'une minute. Même règle de validation |
| `NODE_OPTIONS` | non | Deployment (`--max-old-space-size=384`) | borne du tas V8, à tenir à ~75 % de `resources.limits.memory` (512Mi). Sans elle, V8 se dimensionne sur la mémoire du **nœud** et le pod se fait OOMKiller avant que le ramasse-miettes ne s'active. Toute modification de la limite mémoire doit être répercutée ici |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | non | ConfigMap | vide = traces désactivées |
| `OTEL_SERVICE_NAME` | non | ConfigMap (`beown-api`) | nom du service dans les traces |
| `OTEL_DEPLOYMENT_ENVIRONMENT` | non | ConfigMap (overlay) | environnement dans les traces |
| `SENTRY_DSN` | non | Secret / Prestataire | vide = Sentry désactivé, aucune remontée d'erreur |
| `SENTRY_ENVIRONMENT` | non | ConfigMap (overlay) | étiquette d'environnement |
| `SENTRY_TRACES_SAMPLE_RATE` | non | ConfigMap (`0.1`) | échantillonnage |
| `SENTRY_RELEASE` | non | posé par la CI | pas de corrélation build/erreur |
| `METRICS_TOKEN` | **oui en prod** | Secret | `GET /metrics` **échoue en fermeture** si `NODE_ENV=production` et la variable absente (`metrics.controller.ts:60-67`). Doit être **identique** au secret `beown-metrics-token` du namespace `monitoring` |
| `RECAPTCHA_SECRET_KEY` | **oui en prod** | Secret / Prestataire | **absente du template `secrets.example.yaml`** — voir 3.4. Sans elle, la vérification du CAPTCHA sur l'inscription ne peut pas aboutir |
| `RECAPTCHA_ENABLED` | non | ConfigMap | `false` est **ignoré en production** (erreur journalisée au démarrage) |

### 3.3 Variables lues par le code mais absentes de `.env.example`

Relevé par balayage de `src/` (`process.env.*`, `configService.get*`) le 2026-08-29.

| Variable | Rôle | Où la mettre |
|---|---|---|
| `ADMIN_URL` | origine CORS du back-office et directive CSP | ConfigMap (overlay) — **déjà présente** |
| `API_URL` | URL publique de l'API (logo TOTP, liens) | ConfigMap (overlay) — déjà présente |
| `NODE_ENV` | pilote driver mail/SMS, Swagger, fermeture de `/metrics` | ConfigMap (overlay) — déjà présente |
| `MFA_APP_NAME` | nouveau nom de `TFA_APP_NAME` | ConfigMap, facultatif |
| `MFA_SECRET_ENCRYPTION_KEY` | nouveau nom de `TFA_SECRET_ENCRYPTION_KEY` | Secret, facultatif |
| `JWT_TOKEN_UNSUBSCRIBE_TTL` | durée du lien de désinscription | ConfigMap, facultatif |
| `AML_THRESHOLD_SINGLE` | seuil d'alerte LCB-FT sur une opération (défaut 10 000 €) | ConfigMap — **à décider explicitement** |
| `AML_THRESHOLD_MONTHLY` | seuil d'alerte LCB-FT mensuel | ConfigMap — à décider explicitement |
| `OTEL_SERVICE_VERSION` | version dans les traces | posée par la CI |
| `YOUSIGN_API_KEY` | signature électronique | **Secret — obligatoire si la souscription est ouverte** |
| `YOUSIGN_BASE_URL` | environnement Yousign (bac à sable ou production) | ConfigMap |
| `YOUSIGN_WEBHOOK_SECRET` | signature du webhook Yousign | Secret |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | stockage des médias | ConfigMap + Secret |

> **DANGER** — `YOUSIGN_BASE_URL` non renseignée signifie que la signature part sur l'environnement par défaut du service. Avant d'ouvrir aux vrais investisseurs, vérifiez explicitement que vous êtes sur l'environnement de production Yousign et non sur le bac à sable : un bulletin signé en bac à sable n'a aucune valeur.

### 3.4 Écarts entre le template de secrets et le besoin réel

`k8s/base/secrets.example.yaml` liste 25 clés. Confronté au code, il manque :

| Manquante dans le template | Gravité |
|---|---|
| `TFA_SECRET_ENCRYPTION_KEY` (ou `MFA_SECRET_ENCRYPTION_KEY`) | **haute** — repli silencieux sur `JWT_SECRET`, avec perte des seconds facteurs à la première rotation |
| `RECAPTCHA_SECRET_KEY` | **haute** — protection de l'inscription |
| `YOUSIGN_API_KEY`, `YOUSIGN_WEBHOOK_SECRET` | **haute** si la signature est active |
| `OAUTH_STATE_SECRET` | moyenne |

Et il contient des clés **mortes**, à ne pas remplir : `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_WEBHOOK_SECRET` (Sumsub a été purgé du code), `FEDAPAY_SECRET_KEY` (aucun adaptateur). De même dans le ConfigMap : `SUMSUB_LEVEL_NAME`, `FEDAPAY_ENV`, `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `CONFIRM_EMAIL_URL` — aucune n'est lue par `src/`.

### 3.5 Créer les secrets d'un environnement

**Précondition** : accès `kubectl` au cluster ; valeurs réelles en main.

**Action** — depuis le poste, avec le contexte kubectl pointant sur le cluster :

```bash
# 1. Partir du template, hors Git
cp k8s/base/secrets.example.yaml /tmp/secrets-beown.yaml
#    (le remplir avec les vraies valeurs, dans stringData, en clair)

# 2. Créer le namespace s'il n'existe pas
kubectl create namespace beown --dry-run=client -o yaml | kubectl apply -f -

# 3. Appliquer le Secret dans le namespace
kubectl apply -n beown -f /tmp/secrets-beown.yaml

# 4. Détruire la copie locale
rm -f /tmp/secrets-beown.yaml
```

Générer les valeurs aléatoires (vérifié : `openssl` 3.5.4 présent sur le poste) :

```bash
openssl rand -hex 32     # JWT_SECRET, PROJECT_SHARE_SECRET, METRICS_TOKEN, OAUTH_STATE_SECRET
openssl rand -hex 16     # TFA_SECRET_ENCRYPTION_KEY (32 octets hexadécimaux)
```

**Vérification** :

```bash
kubectl get secret beown-backend-secrets -n beown -o jsonpath='{.data}' | tr ',' '\n' | wc -l
# doit renvoyer le nombre de clés attendues

kubectl get secret beown-backend-secrets -n beown \
  -o jsonpath='{.data.STRIPE_SECRET_KEY}' | base64 -d | cut -c1-7
# doit afficher "sk_live" en production, "sk_test" ailleurs — et RIEN d'autre
```

**Rollback** : `kubectl delete secret beown-backend-secrets -n <ns>` puis réappliquer la version précédente. Les pods ne relisent pas un Secret à chaud : après changement, `kubectl rollout restart deployment/beown-backend -n <ns>`.

> **DANGER** — ne jamais faire `kubectl get secret ... -o yaml` dans un terminal partagé, une capture d'écran ou un ticket : la sortie contient tous les secrets en base64, ce qui n'est pas du chiffrement.

---

## 4. Stripe

C'est l'étape la plus longue et la plus bloquante. Rien d'argent ne fonctionne tant qu'elle n'est pas terminée.

> **CONSTAT** — au 2026-08-29, le compte plateforme de test remonte `charges_enabled=false` et `payouts_enabled=false`. C'est écrit dans `docs/testing/2026-08-21-validation-finale.md` (item A3) et reconfirmé dans `docs/produit/2026-08-29-benchmark-crowdfunding-retrait.md`. Conséquence : **aucun paiement ni retrait n'a jamais tourné de bout en bout**, ni en test ni ailleurs.

### 4.1 Faire valider l'activité par Stripe — avant tout le reste

**Précondition** : structure juridique constituée, dénomination et adresse définitives, description honnête de l'activité.

**Pourquoi cette étape est en premier** : les conditions d'utilisation de Stripe classent les services d'investissement, le courtage et certaines formes de financement participatif parmi les **activités restreintes**. Une fermeture de compte gèlerait les fonds des clients, qui sont précisément sur ce compte.

**Action** :
1. Ouvrir un dossier au support Stripe (Dashboard → Aide → Contacter le support) **avant** toute ouverture commerciale.
2. Décrire l'activité réelle en une page : immobilier locatif fractionné, encaissement de fonds d'investisseurs, versement au porteur de projet, retrait des investisseurs.
3. Demander une **réponse écrite** sur l'éligibilité de cette activité.

**Vérification** : vous détenez un message écrit de Stripe, daté, qui décrit votre activité et l'accepte. Une conversation téléphonique ne vaut rien.

**Rollback** : sans objet — mais si la réponse est négative, **arrêtez la mise en service ici** et remontez à l'arbitrage D2 du plan (choix du prestataire de paiement). Ne cherchez pas à contourner.

### 4.2 Activer le compte plateforme

**Précondition** : 4.1 obtenue.

**Action** — Dashboard Stripe, compte plateforme :
1. Renseigner l'intégralité du profil d'entreprise (forme juridique, numéro d'immatriculation, adresse, représentants, bénéficiaires effectifs).
2. Ajouter le compte bancaire de règlement de la plateforme.
3. Vérifier l'identité des représentants (pièce d'identité).
4. Attendre la validation Stripe.

**Vérification** — en ligne de commande (`stripe` CLI 1.40.9 présent sur le poste), après `stripe login` :

```bash
stripe get /v1/account --live
```

Dans la réponse, les trois champs suivants doivent valoir `true` :
`charges_enabled`, `payouts_enabled`, `details_submitted`.

**Rollback** : aucun. On ne « désactive » pas un compte activé. En revanche, tant que ces trois champs ne sont pas `true`, **n'ouvrez pas la plateforme au public** : les dépôts échoueront et les retraits seront impossibles.

### 4.3 Passer en clés live

**Précondition** : 4.2 terminée.

> **DANGER — le piège numéro un de cette mise en service.** La clé publique Stripe du front est **figée dans l'image Docker au moment du build**, pas lue à l'exécution. Et la valeur par défaut inscrite dans le Dockerfile de production est une clé de **test** :
> `BeOwn - Frontside/BeOwn/dockerfiles/prod.Dockerfile:23` — `ARG VITE_STRIPE_PUBLIC_KEY=pk_test_51TSbaG...`
> Le `Jenkinsfile` du Frontside ne passe **plus aucun `--build-arg`** (commentaire d'en-tête, l.36-42). Si vous déployez `main` tel quel, le front de production parlera à Stripe avec une clé de test pendant que l'API utilisera une clé live : **tout paiement échouera**, avec un message d'erreur incompréhensible pour l'investisseur.

**Action** :

1. Côté API — mettre `sk_live_...` dans `STRIPE_SECRET_KEY` du Secret du namespace `beown` (procédure 3.5), puis :
   ```bash
   kubectl rollout restart deployment/beown-backend -n beown
   kubectl rollout status  deployment/beown-backend -n beown --timeout=180s
   ```
2. Côté front — **deux options, à trancher** :
   - **Option A (recommandée)** : demander au lot outillage de rétablir le passage de `--build-arg VITE_STRIPE_PUBLIC_KEY` depuis un credential Jenkins. C'est une modification de `Jenkinsfile` et de `prod.Dockerfile` : elle sort du périmètre de ce document, qui ne modifie aucun fichier.
   - **Option B (dépannage)** : construire l'image manuellement avec la bonne clé, sur l'hôte :
     ```bash
     docker build -f dockerfiles/prod.Dockerfile \
       --build-arg VITE_STRIPE_PUBLIC_KEY=pk_live_XXXX \
       -t ravikazaha/beown-frontside:<sha-court> .
     docker push ravikazaha/beown-frontside:<sha-court>
     kubectl set image deployment/beown-frontend \
       beown-frontend=ravikazaha/beown-frontside:<sha-court> -n beown
     ```
     Cette option n'est pas reproductible par la CI : elle doit rester exceptionnelle et être tracée.

**Vérification** : sur `https://beown.fr`, ouvrir un écran de dépôt, puis dans l'inspecteur du navigateur, onglet Réseau, contrôler que les appels partent vers `js.stripe.com` avec une clé commençant par `pk_live`. Une clé `pk_test` en production est un échec de l'étape.

**Rollback** : `kubectl rollout undo deployment/beown-frontend -n beown` ramène l'image précédente ; remettre `sk_test_` côté API par la procédure 3.5 puis redémarrer.

> **CONSTAT annexe** — les mêmes Dockerfiles figent `VITE_RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJ...` (clé de démonstration publique de Google, qui valide tout) et `VITE_EXCHANGE_RATE_API_KEY=a8ad0774...` (une vraie clé d'API, en clair dans le dépôt). La première rend le CAPTCHA inopérant en production ; la seconde est une fuite de secret à faire tourner. Les deux relèvent du même correctif que la clé Stripe.

### 4.4 Déclarer les webhooks

**Précondition** : 4.3 faite ; `api.beown.fr` joignable en HTTPS depuis Internet (étape 8).

**URL unique, vérifiée dans le code** :

```
https://api.beown.fr/payments/webhook/stripe
```

Justification : `src/payments/presenters/http/payment.controller.ts:513` déclare `@Post('webhook/stripe')` dans `@Controller('payments')` (l.71) ; `src/main.ts` **ne pose aucun préfixe global**, l'URL est donc bien `/payments/webhook/stripe`. Le corps brut nécessaire à la vérification de signature est préservé par `app.use('/payments/webhook/stripe', express.raw(...))` (`main.ts:91-94`) et `rawBody: true` (`main.ts:26`).

**Événements à cocher** — exactement les sept que le code traite (`payment.controller.ts:536-553`). Un événement non listé est reçu, journalisé, et ignoré :

| Événement | Ce qu'il déclenche | Ligne |
|---|---|---|
| `payment_intent.succeeded` | crédite le portefeuille du déposant, en euros uniquement | `:536` |
| `identity.verification_session.verified` | KYC validé automatiquement | `:538` |
| `identity.verification_session.processing` | KYC en cours d'instruction | `:540` |
| `identity.verification_session.requires_input` | KYC à reprendre par l'utilisateur | `:542` |
| `account.updated` | met à jour `payoutsEnabled` du compte Connect de l'investisseur | `:544` |
| `payout.paid` | finalise un retrait arrivé en banque | `:547` |
| `payout.failed` | annule le transfert et recrédite le portefeuille | `:550` |

**Action** :
1. Dashboard Stripe → Développeurs → Webhooks → **Ajouter un point de terminaison**.
2. URL : celle ci-dessus. Version d'API : **`2026-04-22.dahlia`** — c'est la version épinglée dans le code (`stripe-payment.service.ts:17`, `stripe-identity.service.ts:57`). Une version différente change la forme des objets reçus.
3. Sélectionner les sept événements.
4. Copier le secret de signature (`whsec_...`) dans `STRIPE_WEBHOOK_SECRET` du Secret k8s (procédure 3.5), puis redémarrer le déploiement.
5. Répéter pour chaque environnement déployé, avec son URL : `https://api-staging.beown.fr/payments/webhook/stripe`, `https://api-dev.beown.fr/...`. **Chaque environnement a son propre secret** — ne jamais partager un `whsec_` entre deux environnements.

> Les événements Identity et Payments partagent **le même point de terminaison** ici : il n'y a qu'un contrôleur. Ne créez pas deux endpoints séparés, sauf à vouloir gérer deux secrets pour la même route — ce que le code ne sait pas faire (une seule variable `STRIPE_WEBHOOK_SECRET`).

**Vérification** :
1. Dans le Dashboard, sur le point de terminaison, bouton « Envoyer un événement de test » → `payment_intent.succeeded`. La réponse attendue est **200** avec un corps `{"received":true,...}`.
2. Côté cluster :
   ```bash
   kubectl logs deployment/beown-backend -n beown --since=5m | grep "Stripe webhook"
   # attendu : "Stripe webhook: type=payment_intent.succeeded, id=evt_..."
   ```
3. Si la réponse est **400 « Webhook signature invalide »** : le secret ne correspond pas, ou le pod n'a pas été redémarré après la mise à jour du Secret.

**Rollback** : désactiver le point de terminaison dans le Dashboard (bouton « Désactiver »). Stripe conserve et rejoue les événements jusqu'à trois jours : un endpoint réactivé rattrape son retard. Ne le **supprimez** pas, désactivez-le — la suppression perd l'historique.

### 4.5 Onboarding Stripe Connect, de bout en bout, au moins une fois

**Précondition** : 4.2 et 4.4 faites. Stripe Connect activé sur le compte plateforme (Dashboard → Connect → Démarrer), en type **Express**.

**Pourquoi** : c'est le seul moyen de savoir si le retrait fonctionne. Il n'a jamais tourné.

**Action** :
1. Se connecter au front avec un compte investisseur au KYC validé (persona `investisseur1@beown.fr` en environnement de test, voir `../testing/environnement-local.md`).
2. Aller à l'écran de retrait, lancer l'ajout d'une destination de versement. Le front appelle `POST /payments/connect/onboarding-link` (`payment.controller.ts:317`).
3. Suivre le formulaire hébergé par Stripe jusqu'au bout : identité, adresse, IBAN.
4. Revenir sur la plateforme.
5. Contrôler le statut : `GET /payments/connect/status` (`payment.controller.ts:344`) doit renvoyer `payoutsEnabled: true`.
6. Faire un retrait réel de petit montant (10 € — le plancher applicatif, `payments/domains/instant-payout-limits.ts`).

**Vérification** :
- `payoutsEnabled: true` sur le compte connecté ;
- l'événement `payout.paid` apparaît dans le Dashboard **et** dans les journaux de l'API ;
- le solde du portefeuille en base a bien diminué du montant retiré, une seule fois.

> **CONSTAT — anomalie à prévoir à l'étape 4** : le front appelle `POST /payments/connect/onboarding-link` avec un corps vide (`BeOwn - Frontside/BeOwn/src/data/dataSource/payment.datasource.ts:45`). Le serveur applique alors son URL de retour par défaut : `${FRONTEND_URL}/dashboard/wallet?connect=done` (`payment.controller.ts:323`). Or **`/dashboard/wallet` n'existe pas** dans la table des routes du front (`src/core/config/types/routes.ts` — la page de portefeuille est `/dashboard/add-funds`). L'investisseur qui termine son onboarding Stripe risque donc d'atterrir sur une page inconnue. À vérifier en navigateur lors de ce test ; si c'est confirmé, c'est une correction de code (hors périmètre de ce runbook) à demander avant ouverture.

**Rollback** : un compte Connect créé peut être rejeté côté plateforme (Dashboard → Connect → Comptes → Rejeter). Le retrait déjà parti ne se rappelle pas : seul un `payout.failed` déclenche le recrédit automatique.

### 4.6 Cartes de débit externes — état réel

> **CONSTAT** — la sonde Stripe réelle menée le 2026-08-21 établit que l'attachement d'une carte de débit est **refusé** (`instant_payouts_unsupported`) sur ce compte, et que le versement instantané en zone euro passe par l'IBAN SEPA. Le chemin d'ajout de carte est du **code non exercé**, cas d'erreur compris.

**Conséquence opératoire** : ne pas annoncer, ni dans l'interface ni en communication, un « retrait par carte ». Le benchmark du 2026-08-29 recommande de renommer la fonctionnalité en « virement SEPA instantané » et de garder le virement standard par défaut — ce dernier point est déjà le comportement du code (`WithdrawPanel.tsx:61`), à confirmer en navigateur.

**Bornes du versement instantané**, vérifiées dans `src/payments/domains/instant-payout-limits.ts` : minimum **10 €**, maximum **9 999 €**. Le retrait standard n'a pas de plafond applicatif. Le coût Stripe de l'instantané (environ 1 %) est aujourd'hui **absorbé par la plateforme, sans refacturation** : un retrait instantané de 9 999 € coûte environ 100 € à BeOwn.

### 4.7 Rotation et stockage des clés

**Quand faire tourner une clé** : départ d'un intervenant, clé apparue dans une capture d'écran, un ticket, un journal ou un dépôt Git, doute quelconque. Le doute suffit.

**Procédure — clé secrète Stripe** :
1. Dashboard → Développeurs → Clés API → « Créer une clé restreinte » ou faire tourner la clé secrète.
2. Mettre la nouvelle valeur dans le Secret k8s (procédure 3.5).
3. `kubectl rollout restart deployment/beown-backend -n beown`.
4. Vérifier qu'un dépôt de test aboutit.
5. **Seulement ensuite**, révoquer l'ancienne clé dans le Dashboard.

L'ordre compte : révoquer avant de déployer coupe les paiements pendant tout le temps du redéploiement.

**Procédure — secret de webhook** : le Dashboard permet de faire tourner le secret avec une **période de recouvrement** (les deux secrets valides en parallèle). Utilisez-la : elle évite toute perte d'événement.

**Stockage** : gestionnaire de mots de passe pour les valeurs de référence, `Secret` Kubernetes pour l'exécution. Jamais dans un fichier `.env` commité, jamais dans un message, jamais dans un ticket.

---

## 5. Courriel et SMS

### 5.1 Choisir le transport

Trois pilotes existent (`src/shared/email/email-driver.provider.ts`) :

| Pilote | Usage | Comportement |
|---|---|---|
| `mailpit` | poste local | capture tout, **n'envoie rien** |
| `nodemailer` | **production** | SMTP réel |
| `brevo` | alternative | API HTTP Brevo — implémentée, compte non opérationnel à ce jour |

Sans `MAIL_DRIVER`, la sélection est automatique : `nodemailer` si `NODE_ENV` vaut `development`, `staging` ou `production` ; `mailpit` partout ailleurs. En production le comportement est correct, mais **posez la valeur explicitement** (`MAIL_DRIVER=nodemailer` dans le ConfigMap) : une configuration implicite est une configuration qu'on ne relit pas.

### 5.2 Configurer le SMTP

**Précondition** : un domaine dont vous contrôlez les enregistrements DNS, et un compte SMTP.

> **CONSTAT** — le ConfigMap de base porte `MAIL_HOST: smtp.gmail.com` et `MAIL_FROM: beown@mail.com`. Le second est une adresse de test qui ne vous appartient probablement pas ; l'envoyer comme expéditeur en production fera classer vos courriels en indésirables et cassera toute vérification d'adresse. **À corriger avant ouverture.**

**Action** :
1. Choisir l'expéditeur définitif, sur votre domaine : `no-reply@beown.fr`.
2. Créer le compte d'envoi chez le fournisseur. Sur Gmail, générer un **mot de passe d'application** (le mot de passe du compte ne fonctionne pas).
3. Renseigner : `MAIL_HOST`, `MAIL_PORT` (587 = STARTTLS, 465 = TLS implicite), `MAIL_FROM`, `MAIL_FROM_NAME` en ConfigMap ; `MAIL_USER`, `MAIL_USER_PASSWORD` en Secret.
4. Publier les enregistrements DNS d'authentification du domaine expéditeur : **SPF**, **DKIM**, **DMARC**. Sans eux, une bonne partie des messages n'arrivera pas — et vous n'en saurez rien.
5. Redémarrer : `kubectl rollout restart deployment/beown-backend -n beown`.

**Vérification** :
1. Au démarrage, l'application journalise le transport retenu. Contrôler :
   ```bash
   kubectl logs deployment/beown-backend -n beown | grep -i "transport email"
   ```
   La ligne doit désigner **nodemailer**, pas Mailpit.
2. Test fonctionnel de bout en bout : créer un compte de test sur l'environnement, déclencher la vérification d'adresse, **recevoir réellement** le courriel dans une boîte externe (pas dans votre propre domaine, pour éprouver la délivrabilité).
3. Contrôler dans l'en-tête du message reçu que SPF et DKIM sont en `pass`.

**Rollback** : remettre les valeurs précédentes dans le ConfigMap et le Secret, redémarrer. Aucun effet de bord : les courriels non partis ne sont pas mis en file, ils sont perdus — c'est pourquoi le test doit être fait avant l'ouverture, pas après.

### 5.3 SMS

`SMS_DRIVER` vide et `NODE_ENV=production` sélectionne Twilio. **Sans les trois variables Twilio complètes, le code retombe silencieusement sur le pilote `log`** : aucun SMS ne part, aucune erreur ne remonte (`src/shared/sms/sms.module.ts:54-58`). Si un parcours dépend d'un code par SMS, cette bascule silencieuse le rend impossible sans message d'erreur. Décidez explicitement : soit Twilio est configuré, soit `SMS_DRIVER=log` est posé volontairement et aucun parcours ne repose sur le SMS.

---

## 6. Base de données

### 6.1 Le point de blocage à connaître avant tout

> **DANGER — `npm run migration:run` est cassé. Ne le lancez pas.**
> Cette interdiction est écrite dans `../testing/environnement-local.md` (contrainte n°3) et reprise comme dette **D9** du rapport de validation du 2026-08-21 : « `migration:run` toujours cassé — le schéma dev ne tient que par le `synchronize` du seed », priorité **haute avant tout déploiement partagé**.

> **DANGER — le pipeline de déploiement l'exécute quand même.**
> `Jenkinsfile:223` (dev/staging/test) et `Jenkinsfile:229` (production) lancent `kubectl exec ... -- npm run migration:run` à chaque déploiement. En non-production, la ligne suivante (`:224`) lance `npm run seed`, qui **injecte les jeux de données de démonstration**. Conséquences à assumer avant le premier build :
> - en production, l'étape de migration échouera et fera passer le build en échec **après** que les pods aient été mis à jour : l'application tournera, le pipeline sera rouge, et vous ne saurez pas dire si le déploiement est valide ;
> - en dev et staging, chaque déploiement rejoue le seed sur la base existante.
> **Correction attendue** : retirer ces trois lignes du `Jenkinsfile`, ou réparer les migrations. Les deux sortent du périmètre de ce document, qui ne modifie aucun fichier. **Tant que ce n'est pas fait, ne déclenchez pas de build sur `main`.**

> **DANGER — `npm run schema:drop` détruit la totalité du schéma et des données.** Sur un environnement partagé, c'est une perte définitive sans sauvegarde préalable. Cette commande n'a sa place que sur un poste local.

### 6.2 Créer le schéma en production — état des lieux honnête

L'application tourne en `synchronize: false` (`src/app.module.ts:108`, `src/data-source.ts:15`) : elle **ne crée jamais** le schéma. Les deux seules voies existantes sont :

| Voie | État | Verdict |
|---|---|---|
| `npm run migration:run` | cassée (D9) | inutilisable |
| `npm run seed` | fonctionne — le module de seed force `synchronize: true` (`database/seeds/seed.module.ts:74`) et crée le schéma, **puis insère les données de démonstration** (17 comptes, projets fictifs) | inacceptable en production |

**Il n'existe donc aujourd'hui aucune procédure propre de création du schéma de production.** C'est un bloquant de mise en service, pas une préférence de style. Trois issues, à arbitrer avec le développement backend :

- **A** — réparer les migrations, puis `migration:run` en production. C'est la voie correcte.
- **B** — extraire le schéma d'une base construite par le seed, dans un fichier SQL de structure, et l'appliquer sur la base de production vide :
  ```bash
  # sur un environnement jetable, après un seed réussi
  pg_dump --schema-only --no-owner --no-privileges -U <user> -d beown > schema-prod.sql
  # puis, sur la base de production VIDE
  psql -U <user> -d beown -f schema-prod.sql
  ```
  Vérifié : `pg_dump` et `psql` sont disponibles dans `C:\Program Files\PostgreSQL\18\bin\`. Cette voie est un contournement : elle ne crée aucun historique de migration, et le prochain changement de schéma se heurtera au même mur.
- **C** — retarder l'ouverture jusqu'à ce que A soit fait.

**Ne choisissez pas B sans écrire pourquoi**, dans une note de décision technique.

### 6.3 Sauvegarde de PostgreSQL

> **CONSTAT** — aucune sauvegarde n'existe. Pas de `CronJob`, pas de script, pas de stockage externe dans les trois dépôts. La base vit sur un volume `local-path` de 10 Gio attaché à un seul nœud (`k8s/base/postgres.yaml`). La perte du nœud est la perte de la totalité des données. Le plan de gestion extinctive (`plan-gestion-extinctive.md`) promet pourtant une sauvegarde quotidienne chiffrée hors site : **cette promesse n'est pas tenue par l'infrastructure actuelle.**

**Sauvegarde manuelle, immédiatement applicable** :

```bash
# 1. Nom du pod Postgres du namespace visé
kubectl get pods -n beown -l app=postgres

# 2. Sauvegarde complète, compressée, horodatée (NON VÉRIFIÉ depuis le poste)
kubectl exec -n beown postgres-0 -- \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c' \
  > beown-$(date +%Y%m%d-%H%M).dump

# 3. Chiffrer avant de la déposer où que ce soit
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in  beown-20260829-1200.dump \
  -out beown-20260829-1200.dump.enc
```

**Vérification** : le fichier fait plus de quelques kilo-octets, et son contenu est lisible par `pg_restore --list` :

```bash
pg_restore --list beown-20260829-1200.dump | head -20
# doit lister des tables ; une sortie vide = sauvegarde inutilisable
```

**Fréquence et rétention à retenir** (à mettre en place, aujourd'hui inexistantes) :

| Élément | Valeur cible | Justification |
|---|---|---|
| Fréquence | quotidienne, la nuit | perte maximale acceptable : 24 h de mouvements |
| Rétention courte | 14 sauvegardes quotidiennes | couvre la détection tardive d'un incident |
| Rétention longue | 12 sauvegardes mensuelles | obligations de conservation |
| Chiffrement | systématique, clé hors du serveur | la sauvegarde contient toutes les données personnelles |
| Emplacement | **hors du cluster** | une sauvegarde sur le même disque que la base ne protège de rien |
| Test de restauration | **mensuel** | une sauvegarde jamais restaurée n'est pas une sauvegarde |

### 6.4 Restauration — la procédure à répéter avant d'en avoir besoin

> **DANGER** — la restauration écrase les données existantes. Sur une base de production, elle fait perdre tout ce qui a été écrit depuis la sauvegarde. Ne l'exécutez jamais « pour voir ».

**Répétition à blanc (recommandée, sans risque)** : restaurer dans une base **nouvelle** du namespace `beown-test`.

```bash
# 1. Copier la sauvegarde dans le pod
kubectl cp beown-20260829-1200.dump beown-test/postgres-0:/tmp/restore.dump

# 2. Créer une base neuve à côté de l'existante
kubectl exec -n beown-test postgres-0 -- \
  psql -U "$POSTGRES_USER" -c 'CREATE DATABASE beown_restore_test;'

# 3. Restaurer dedans
kubectl exec -n beown-test postgres-0 -- \
  pg_restore -U "$POSTGRES_USER" -d beown_restore_test --no-owner /tmp/restore.dump

# 4. Compter ce qui est revenu
kubectl exec -n beown-test postgres-0 -- \
  psql -U "$POSTGRES_USER" -d beown_restore_test \
  -c 'SELECT count(*) FROM users;' -c 'SELECT count(*) FROM projet;'
```

**Vérification** : les comptages correspondent à ceux de la base source au moment de la sauvegarde. Notez la **durée totale** de l'opération : c'est votre temps de rétablissement réel, celui que vous annoncerez en cas d'incident.

**Après toute restauration partielle ou tout insert manuel** — étape obligatoire, sous peine d'inscriptions qui échouent en `409 REGISTRATION_CONFLICT` (cause racine documentée dans `../testing/environnement-local.md`) :

```sql
SELECT setval('users_userId_seq',       COALESCE((SELECT MAX("userId") FROM users), 1),       true);
SELECT setval('user_emails_userId_seq', COALESCE((SELECT MAX("userId") FROM user_emails), 1), true);
```

**Rollback d'une restauration** : il n'y en a pas. C'est pour cela qu'on prend une sauvegarde **avant** de restaurer, même quand la base semble perdue.

---

## 7. CI/CD — Jenkins et déclenchement par GitHub

### 7.1 Ce qui existe

Jenkins tourne dans un conteneur Docker sur le serveur, et exécute toutes les commandes `docker` et `kubectl` **par SSH sur l'hôte** (en-têtes des trois `Jenkinsfile`). Les plugins requis sont **SSH Pipeline Steps** et **NodeJS** (outil nommé `NodeJS-24` pour les deux fronts).

Credentials attendus, aux identifiants exacts :

| Identifiant | Type | Usage |
|---|---|---|
| `dockerhub-credentials` | nom d'utilisateur / mot de passe | publication des images |
| `ssh-host-key` | nom d'utilisateur SSH + clé privée | exécution sur l'hôte |

> Les documents `BeOwn - Frontside/BeOwn/JENKINS-SETUP.md` et `README-DEPLOYMENT.md` décrivent un pipeline **qui n'existe plus** : credential `docker-registry-credentials`, notifications Slack, déploiement sur `localhost:3000`. Ils sont obsolètes et contredisent les `Jenkinsfile` réels. **Ne les suivez pas** ; ce runbook les remplace.

### 7.2 Faire déclencher les builds par un `git push`

> **CONSTAT** — aujourd'hui, aucun webhook GitHub n'est configuré : les builds se lancent à la main depuis Jenkins. C'est la cause la plus fréquente de « j'ai poussé, mais rien n'a changé en ligne ».

**Précondition** : `jenkins.beown.fr` joignable en HTTPS depuis Internet (GitHub doit pouvoir l'atteindre), et droits d'administration sur les trois dépôts.

**Action — pour chacun des trois dépôts** :

1. Dans Jenkins, sur le job : Configurer → **Déclencheurs de build** → cocher **« GitHub hook trigger for GITScm polling »**. Enregistrer.
2. Sur GitHub : dépôt → *Settings* → *Webhooks* → *Add webhook* :
   - **Payload URL** : `https://jenkins.beown.fr/github-webhook/` — la barre oblique finale est obligatoire ;
   - **Content type** : `application/json` ;
   - **Secret** : une valeur aléatoire (`openssl rand -hex 32`), la même que celle configurée côté Jenkins ;
   - **Events** : « Just the push event » suffit ; ajoutez *Pull request* si vous voulez valider les branches de fonctionnalité ;
   - **Active** : coché.
3. Répéter pour `BeOwn-Backside`, `BeOwn-Frontside`, `BeOwn-backoffice-ADMIN`.

**Vérification** :
1. Sur GitHub, page du webhook → onglet *Recent Deliveries* : la livraison de test doit être en **200**.
2. Pousser un commit sans effet (par exemple sur `develop`) et constater qu'un build démarre **seul** dans Jenkins, dans la minute.
3. Contrôler dans la sortie console la ligne d'initialisation, qui affiche la branche, l'image et l'environnement cible : `Branche : develop | Image : ... | Env : dev`.

**Rollback** : décocher *Active* sur le webhook GitHub. Les builds redeviennent manuels, rien d'autre ne change.

> **DANGER** — activer le webhook sur `main` avant d'avoir traité le point 6.1 (`migration:run` dans le pipeline) et le point 1.2 (confirmation manuelle désactivée côté Admin) revient à câbler un déploiement automatique en production sur un pipeline dont une étape est cassée. **Activez d'abord `develop`, puis `staging`, et `main` en dernier.**

### 7.3 Vérifier le mapping branche → environnement

**Action** — lancer un build sur `develop` et lire la première ligne de la console.

**Vérification** :

```bash
# après un build sur develop
kubectl get pods -n beown-dev -l app=beown-backend
kubectl get deployment beown-backend -n beown-dev -o jsonpath='{.spec.template.spec.containers[0].image}'
# doit afficher ravikazaha/beown-backside:<sha-court-du-commit-poussé>
```

Le tag de l'image **doit** être un SHA de commit, jamais `latest`. Un `latest` déployé rend le rollback impossible à identifier.

**Rollback** : voir 7.4.

### 7.4 Revenir en arrière sur un déploiement

C'est la procédure à connaître par cœur. Elle est plus rapide que n'importe quelle investigation.

**Option 1 — annuler le dernier déploiement (le plus rapide)** :

```bash
kubectl rollout undo deployment/beown-backend -n beown
kubectl rollout status deployment/beown-backend -n beown --timeout=180s
```

**Option 2 — revenir à une image précise** :

```bash
# lister l'historique
kubectl rollout history deployment/beown-backend -n beown

# revenir à une révision donnée
kubectl rollout undo deployment/beown-backend -n beown --to-revision=<n>

# ou forcer une image connue bonne
kubectl set image deployment/beown-backend \
  beown-backend=ravikazaha/beown-backside:<sha-court> -n beown
```

Faire de même, si nécessaire, pour `beown-frontend` et `beown-frontend-admin`.

**Vérification** : `kubectl rollout status` répond `successfully rolled out`, la sonde `https://api.beown.fr/health/ready` répond **200**, et un parcours de la checklist passe.

**Limite à connaître** : le rollback ramène le **code**, jamais la **base**. Si le déploiement fautif a modifié le schéma ou des données, l'ancien code peut ne plus fonctionner sur la base modifiée. C'est la raison pour laquelle toute évolution de schéma doit rester compatible avec la version précédente le temps du déploiement.

---

## 8. Domaines et TLS

> **CONSTAT** — aucun manifeste `Ingress`, aucun `cert-manager`, aucune configuration TLS dans les trois dépôts. Le routage public et les certificats existent sur le serveur, hors Git. Ce document ne peut donc pas décrire votre configuration réelle : il décrit ce qui **doit** être vrai, et comment le vérifier.

### 8.1 Enregistrements DNS attendus

Déduits des overlays (`k8s/overlays/*/configmap-patch.yaml`) et des Dockerfiles des fronts :

| Nom | Sert | Environnement |
|---|---|---|
| `beown.fr` | front investisseur | production |
| `www.beown.fr` | redirection vers `beown.fr` | production |
| `api.beown.fr` | API | production |
| `admin.beown.fr` | back-office | production |
| `staging.beown.fr`, `api-staging.beown.fr`, `admin-staging.beown.fr` | les trois | staging |
| `dev.beown.fr`, `api-dev.beown.fr`, `admin-dev.beown.fr` | les trois | dev |
| `test.beown.fr`, `api-test.beown.fr`, `admin-test.beown.fr` | API seulement (aucun overlay front `test`) | test |
| `jenkins.beown.fr` | Jenkins | outillage |

> **DANGER — `www.beown.fr`.** La politique CORS de l'API n'autorise **que** les valeurs exactes de `FRONTEND_URL` et `ADMIN_URL` (`src/main.ts:184-199`). Un visiteur qui arrive sur `https://www.beown.fr` verra toutes ses requêtes API bloquées par le navigateur, sans message compréhensible. **Faites de `www` une redirection HTTP 301 vers `beown.fr`**, ne le servez pas comme un site à part entière.

### 8.2 Émettre et renouveler les certificats

**Précondition** : les enregistrements DNS pointent vers l'adresse publique du serveur, propagation terminée.

**Action** : selon le contrôleur d'entrée réellement installé (la `NetworkPolicy` de `k8s/monitoring/networkpolicy.yaml` suppose `ingress-nginx`, avec la mention explicite « adapter au controller réellement déployé »), l'usage est un certificat Let's Encrypt automatiquement renouvelé, posé par `cert-manager` ou par le mécanisme intégré du contrôleur.

**Vérification** — depuis n'importe quel poste :

```bash
# validité et dates du certificat
echo | openssl s_client -connect api.beown.fr:443 -servername api.beown.fr 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

# la sonde applicative répond derrière le TLS
curl -sS -o /dev/null -w "%{http_code}\n" https://api.beown.fr/health/ready
# attendu : 200
```

Contrôler à la fois `api.beown.fr`, `beown.fr` et `admin.beown.fr`.

**Renouvellement** : automatique s'il est bien configuré. **Vérifiez-le 30 jours avant la première expiration**, en relisant `notAfter` dans la commande ci-dessus. Un certificat expiré rend la plateforme inaccessible en totalité, y compris les webhooks Stripe.

**Rollback** : un changement DNS ne se « défait » pas instantanément — la propagation prend le temps du TTL. Avant toute modification, **abaissez le TTL à 300 secondes 24 heures à l'avance**, et ne touchez au DNS que dans une fenêtre où vous êtes disponible pendant les deux heures qui suivent.

### 8.3 En-têtes de sécurité

Le front est servi par Nginx (`BeOwn - Frontside/BeOwn/nginx.conf`), qui pose `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection` et `Referrer-Policy`. **Il ne pose ni HSTS ni politique de sécurité du contenu.** L'API pose sa propre politique via Helmet (`src/main.ts:64-89`). Ajouter `Strict-Transport-Security` au niveau de l'ingress est une amélioration à demander, mais ne bloque pas l'ouverture.

---

## 9. Observabilité et alertes

### 9.1 Ce que `k8s/monitoring/` déploie

| Fichier | Rôle |
|---|---|
| `alloy-values.yaml` | valeurs Helm de l'agent **Grafana Alloy**, en DaemonSet dans le namespace `monitoring` |
| `config.alloy` | ce que l'agent collecte : métriques (`/metrics` de l'API, toutes les 15 s), journaux des pods, traces OTLP |
| `alert-rules.yaml` | 17 règles d'alerte, à charger dans le ruler Grafana Cloud |
| `networkpolicy.yaml` | restreint l'accès réseau au port 8080 des pods de l'API |

**Le tout n'est pas déployé** : aucun de ces fichiers n'est appliqué par les `Jenkinsfile`. C'est une installation manuelle, à faire une fois.

### 9.2 Installer la collecte

**Précondition** : compte Grafana Cloud (région UE), `helm` installé sur la machine qui pilote le cluster — **absent du poste de développement**, à installer.

**Action** (NON VÉRIFIÉ — commandes reprises des en-têtes de `alloy-values.yaml`) :

```bash
# 1. Secret des identifiants Grafana Cloud (jamais commité)
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic grafana-cloud-credentials -n monitoring \
  --from-literal=PROM_URL='...' --from-literal=PROM_USERNAME='...' \
  --from-literal=LOKI_URL='...' --from-literal=LOKI_USERNAME='...' \
  --from-literal=TEMPO_URL='...' --from-literal=TEMPO_USERNAME='...' \
  --from-literal=GRAFANA_CLOUD_API_TOKEN='...'

# 2. Jeton de scrape — MÊME valeur que METRICS_TOKEN du Secret applicatif
kubectl create secret generic beown-metrics-token -n monitoring \
  --from-literal=METRICS_TOKEN='<même valeur que beown-backend-secrets>'

# 3. Agent Alloy
helm repo add grafana https://grafana.github.io/helm-charts
helm upgrade --install alloy grafana/alloy \
  --namespace monitoring --create-namespace \
  --values k8s/monitoring/alloy-values.yaml \
  --set-file alloy.configMap.content=k8s/monitoring/config.alloy

# 4. Politique réseau
kubectl apply -f k8s/monitoring/networkpolicy.yaml

# 5. Règles d'alerte (mimirtool — absent du poste, à installer)
mimirtool rules load k8s/monitoring/alert-rules.yaml \
  --address="https://prometheus-prod-XX-prod-eu-west-N.grafana.net" \
  --id="<PROM_USERNAME>" --key="<GRAFANA_CLOUD_API_TOKEN>"
```

**Vérification** :
```bash
kubectl get pods -n monitoring
# les pods alloy doivent être Running

kubectl logs -n monitoring -l app.kubernetes.io/name=alloy --tail=50 | grep -i "beown-api"
# la cible beown-api doit être découverte, sans 401
```
Dans Grafana, la requête `up{job="beown-api"}` doit renvoyer `1`. Un `401` dans les journaux d'Alloy signifie que `METRICS_TOKEN` diffère entre les deux namespaces.

**Rollback** : `helm uninstall alloy -n monitoring`. L'application continue de fonctionner : la collecte est passive.

### 9.3 Les alertes qui existent

17 règles, dans cinq familles (`k8s/monitoring/alert-rules.yaml`) :

| Famille | Alertes | Ce qu'elles couvrent |
|---|---|---|
| Intégrité financière | `WalletLedgerDiscrepancy`, `StripeBalanceDiscrepancy`, `ReconciliationStale`, `PayoutReversalFailedOrUnreferenced`, `DepositCurrencyBlockedNonEur`, `WithdrawalTransferFailedSpike` | écarts comptables, retraits en échec, dépôt en devise étrangère |
| Sécurité | `StripeWebhookSignatureInvalid`, `AuthThrottleBruteForce`, `SignInCredentialStuffing` | webhook cassé, attaques sur la connexion |
| Conformité | `AmlThresholdExceeded`, `KycManualReviewBacklog`, `KycAutoValidationRateDrop` | seuils LCB-FT, file de revue KYC |
| Portefeuille | `EcheanceAutoPayFailures`, `EcheancesDueUnverifiedBacklog`, `EcheanceOverdueSurge` | échéances non payées |
| Disponibilité | `ApiHighErrorRate`, `ApiHighLatencyP95`, `ApiDependencyDown`, `ApiInstanceUnavailable`, plus deux règles de consommation du budget d'erreur | santé de l'API, objectif de disponibilité 99,9 % |

### 9.4 Les alertes qui ne se déclencheront jamais — à savoir avant de s'y fier

> **CONSTAT — trois alertes critiques sont mortes.** Les métriques `beown_wallet_ledger_discrepancy_eur`, `beown_stripe_balance_discrepancy_eur` et `beown_reconciliation_last_success_timestamp` sont **déclarées** (`src/observability/metrics/metric-names.ts:71-74`, `prometheus-metrics.adapter.ts:337-347`) mais **aucun code ne leur affecte de valeur** : le balayage de `src/` ne trouve aucun appel `setGauge` sur ces trois métriques. Les séries n'existeront donc pas dans Grafana, et les alertes `WalletLedgerDiscrepancy`, `StripeBalanceDiscrepancy` et `ReconciliationStale` resteront silencieuses en toutes circonstances.

Autrement dit : **la surveillance de l'intégrité financière est un décor.** Il n'existe par ailleurs aucune réconciliation entre le registre interne et le solde réel du compte Stripe — c'est le constat central du benchmark du 2026-08-29.

**Chemins critiques non couverts, à faire chiffrer** :

| Chemin | Manque |
|---|---|
| Réconciliation registre ↔ Stripe | tâche périodique inexistante, et donc trois alertes mortes |
| Versement au porteur de projet | aucun code ne le paie, donc aucune métrique et aucune alerte |
| Échec d'envoi de courriel | aucune métrique : une panne SMTP est invisible, alors qu'elle bloque inscriptions et vérifications |
| Signature Yousign | aucune alerte sur l'échec de signature ou l'indisponibilité du webhook |
| Sauvegarde de la base | rien à surveiller puisque rien ne sauvegarde |
| Expiration des certificats TLS | aucune alerte |

**Ce que vous pouvez faire sans développement** : une surveillance externe (Better Stack, UptimeRobot ou équivalent) sur `https://api.beown.fr/health/ready`, `https://beown.fr` et `https://admin.beown.fr`, avec notification par courriel et SMS. C'est le filet minimal, et il ne dépend d'aucune des briques ci-dessus.

### 9.5 Où regarder en cas d'incident

| Question | Où |
|---|---|
| L'API répond-elle ? | `curl -s -o /dev/null -w "%{http_code}" https://api.beown.fr/health/ready` |
| Les pods tournent-ils ? | `kubectl get pods -n beown` |
| Que s'est-il passé dans le cluster ? | `kubectl get events -n beown --sort-by=.lastTimestamp \| tail -30` |
| Que dit l'application ? | `kubectl logs deployment/beown-backend -n beown --tail=200` |
| Un webhook Stripe a-t-il échoué ? | Dashboard Stripe → Développeurs → Webhooks → onglet des tentatives |
| Une erreur applicative ? | Sentry, si `SENTRY_DSN` est renseigné |
| Métriques et journaux corrélés ? | Grafana Cloud, si l'étape 9.2 est faite |

---

## 10. Rollback — vue d'ensemble

| Ce qui a mal tourné | Procédure | Durée | Perte |
|---|---|---|---|
| Déploiement applicatif défaillant | `kubectl rollout undo deployment/<nom> -n <ns>` (7.4) | 1 à 3 minutes | aucune |
| Mauvaise valeur de configuration | corriger le ConfigMap ou le Secret, puis `rollout restart` | 2 à 5 minutes | aucune |
| Clé Stripe compromise | rotation (4.7) : créer, déployer, vérifier, **puis** révoquer | 15 minutes | aucune si l'ordre est respecté |
| Webhook Stripe cassé | désactiver le point de terminaison, corriger le secret, réactiver — Stripe rejoue jusqu'à 3 jours | 10 minutes | aucune |
| Données détruites ou corrompues | restauration (6.4) | à mesurer lors de la répétition à blanc | tout ce qui suit la dernière sauvegarde |
| Certificat expiré | réémission par le contrôleur d'entrée | variable | indisponibilité totale pendant l'incident |
| Changement DNS malheureux | remettre l'ancien enregistrement, attendre le TTL | jusqu'à plusieurs heures | indisponibilité partielle |

**Règle d'incident** : on stabilise d'abord (rollback), on comprend ensuite. Chercher la cause pendant que la production est en panne allonge la panne.

---

## 11. Ne jamais faire

1. **`npm run migration:run`** — cassé. Le lancer, y compris via le pipeline, produit un échec ou un état incertain (6.1).
2. **`npm run schema:drop`** sur un environnement partagé — destruction totale, sans retour.
3. **`npm run seed`** en production — écrit des comptes et des projets de démonstration dans la base réelle.
4. **`git push --force`** sur `main`, `staging` ou `develop` — réécrit l'histoire commune et casse les correspondances entre images et commits.
5. **Modifier un enregistrement DNS hors fenêtre planifiée**, sans avoir abaissé le TTL 24 heures avant.
6. **Déployer sur `main` sans confirmation** — à rétablir côté Admin (`BeOwn - Admin/Jenkinsfile:227`).
7. **Copier un secret dans un message, un ticket, une capture d'écran ou un fichier du dépôt.** `kubectl get secret -o yaml` affiche tout : base64 n'est pas du chiffrement.
8. **Révoquer une clé avant d'avoir déployé la nouvelle** — coupure garantie.
9. **Réutiliser un secret de webhook entre deux environnements** — un événement de staging serait accepté en production.
10. **Restaurer une sauvegarde sans en avoir pris une juste avant.**
11. **Ouvrir au public avant que `charges_enabled` et `payouts_enabled` valent `true`** — les investisseurs déposeraient sans pouvoir retirer.
12. **Faire confiance aux alertes d'intégrité financière** tant que le point 9.4 n'est pas corrigé.

---

## 12. État d'avancement — à tenir à jour

| # | Étape | Fait le | Par | Preuve |
|---|---|---|---|---|
| 2 | Comptes prestataires ouverts | | | |
| 3 | Secrets créés dans les 4 namespaces | | | |
| 4.1 | Activité validée par écrit par Stripe | | | |
| 4.2 | `charges_enabled` et `payouts_enabled` à `true` | | | |
| 4.3 | Clés live des deux côtés, front reconstruit | | | |
| 4.4 | Webhooks déclarés, événement de test en 200 | | | |
| 4.5 | Onboarding Connect abouti, un retrait réel | | | |
| 5 | SMTP en production, courriel reçu hors domaine | | | |
| 6.2 | Schéma de production créé, voie retenue documentée | | | |
| 6.3 | Sauvegarde quotidienne en place, hors cluster | | | |
| 6.4 | Restauration répétée à blanc, durée mesurée | | | |
| 7.2 | Webhooks GitHub actifs sur les 3 dépôts | | | |
| 7.4 | Rollback répété à blanc sur staging | | | |
| 8 | DNS et TLS vérifiés sur les 3 domaines de production | | | |
| 9.2 | Collecte déployée, `up{job="beown-api"}` à 1 | | | |
| 9.4 | Surveillance externe branchée | | | |
| — | Checklist de mise en service passée intégralement | | | |

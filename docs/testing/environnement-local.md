# Environnement de test local — BeOwn

Fiche de référence pour la campagne QA navigateur (générée le 2026-08-20).

## Services

| Service | URL | Notes |
|---|---|---|
| Frontside investisseur | http://localhost:5173 | Vite dev server |
| Admin back-office | http://localhost:5174 | Vite dev server |
| API NestJS | http://localhost:3002 | Tourne depuis `dist/main` (build compilé, PAS de watch — un changement de code nécessite `npm run build` puis redémarrage) |
| PostgreSQL | localhost:5432, base `beown` | psql : `C:/Program Files/PostgreSQL/18/bin/psql.exe`, user `postgres`, mot de passe dans `.env` (`DATABASE_PASSWORD`) |
| Health check | http://localhost:3002/health | 200 attendu |

## Stripe

- Mode **test** des deux côtés (`sk_test_` backend, `pk_test_` Frontside).
- Compte plateforme : **FR / EUR** (vérifié via `GET /v1/account`) → Stripe Connect et Instant Payouts zone euro disponibles.
- Cartes de test : `4242 4242 4242 4242` (succès), `4000 0025 0000 3155` (3D Secure), `4000 0566 5566 5556` (carte de **débit** Visa — requise pour les external accounts de retrait et l'Instant Payout).

## Comptes de test (17 comptes, 13 rôles)

Mots de passe :
- Rôles back-office : `Admin@BeOwn#2026!Secure`
- Porteurs : `Porteur@2026!`
- Investisseurs : `Investisseur@2026!`

| Email | Rôle | État |
|---|---|---|
| admin@beown.fr | super_admin | actif |
| cio@beown.fr | cio | actif |
| marketing@beown.fr | marketing | actif |
| analyste@beown.fr | analyste_financier | actif |
| relation@beown.fr | charge_relation_investisseur | actif |
| compliance@beown.fr | compliance | actif |
| financier@beown.fr | financier | actif |
| support@beown.fr | support | actif |
| dpo@beown.fr | dpo | actif |
| rcci@beown.fr | rcci | actif |
| cgp@beown.fr | cgp | actif |
| porteur1@beown.fr / porteur2@beown.fr | porteur | actif |
| investisseur1@beown.fr | investisseur | KYC **validé**, wallet EUR **12 250 €** (userId 8) — persona retrait |
| investisseur2@beown.fr / investisseur3@beown.fr | investisseur | KYC validé |
| investisseur4@beown.fr | investisseur | **non-KYC** (aucun dossier KYC, wallet vide, userId 11) — persona gating. NE PAS valider son KYC pendant les tests |

Les comptes compliance/financier/support/dpo/rcci/cgp ont été créés par clonage SQL du hash admin (hors seed) : un `schema:drop` + `seed` les supprime — rejouer alors la création (voir §Reset).

## Contraintes à respecter pendant les tests

1. **Rate limiting sign-in : 10 tentatives / 15 min / IP** (palier `auth`, stockage Redis). Conséquence : créer les storage states Playwright UNE fois, les persister et les réutiliser. Ne jamais boucler sur le login.
2. **CAPTCHA** : reCAPTCHA en clés de **test** Google (validation toujours OK). L'inscription est automatisable ; côté API le champ `captchaToken` accepte n'importe quelle valeur non vide.
3. **Interdiction absolue** : `npm run migration:run` (cassé). Reset uniquement par `npm run schema:drop` puis `npm run seed`.
4. Le backend sert un build : ne pas s'attendre à voir des modifications de code sans rebuild + restart explicite et coordonné.

## Reset complet (destructif — à coordonner)

```bash
cd BeOwn-Backside
npm run schema:drop && npm run seed   # 35 tables recréées
# puis recréer investisseur4 (sign-up API + UPDATE isVerified) et les 6 comptes rôles (clonage SQL)
```

### Obligatoire après TOUT insert SQL manuel : réaligner les séquences

Un `INSERT` SQL qui fournit lui-même la clé primaire **ne fait pas avancer** la
séquence associée. La séquence continue alors de distribuer des identifiants
déjà pris, et chaque insertion applicative échoue tant que le compteur n'a pas
rattrapé le maximum réel.

C'est la cause racine d'ANO-01 : le clonage SQL des 6 comptes de rôles avait
porté `max(user_emails."userId")` à 17 alors que `user_emails_userId_seq`
restait à 12 — cinq inscriptions consécutives ont échoué avant que la séquence
ne rattrape son retard.

À exécuter systématiquement après le clonage des comptes de rôles, après tout
`INSERT` manuel, et après toute restauration de sauvegarde partielle :

```bash
docker exec -i <conteneur_postgres> psql -U <user> -d <db> <<'SQL'
SELECT setval('users_userId_seq',       COALESCE((SELECT MAX("userId") FROM users), 1),        true);
SELECT setval('user_emails_userId_seq', COALESCE((SELECT MAX("userId") FROM user_emails), 1),  true);
SQL
```

Vérification — les deux valeurs doivent être `>= max(...)` de leur table :

```sql
SELECT sequencename, last_value FROM pg_sequences
WHERE sequencename IN ('users_userId_seq', 'user_emails_userId_seq');

SELECT MAX("userId") AS max_users FROM users;
SELECT MAX("userId") AS max_user_emails FROM user_emails;
```

Symptôme si l'étape est oubliée : `POST /auth/sign-up` répond
`409 {"code":"REGISTRATION_CONFLICT"}` (auparavant un `500` opaque — corrigé
avec ANO-01) et le journal serveur nomme la contrainte violée.

## Endpoints utiles (vérifiés)

- `POST /auth/sign-in` `{email, password}` → `{accessToken, refreshToken}`
- `POST /auth/sign-up` `{email, password, firstname, lastname, captchaToken}`
- `GET /users/me`, `GET /profiles/kyc/me`, `GET /wallets/user/:userId`
- `GET /payments/connect/status`, `POST /payments/connect/onboarding-link`, `POST /payments/retrait`

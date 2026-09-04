# Environnement de test local — BeOwn

Fiche de référence pour la campagne QA navigateur (mise à jour 2026-09-02 :
jeu de données seedé enrichi — 3 porteurs, 6 investisseurs, 7 projets).

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

## Comptes de test (20 comptes, TOUS seedés)

Mots de passe :
- Rôles back-office (cgp inclus) : `Admin@BeOwn#2026!Secure`
- Porteurs : `Porteur@2026!`
- Investisseurs : `Investisseur@2026!`

Le seed crée désormais **tous** les comptes, y compris les 6 rôles
complémentaires et `investisseur4` (auparavant créés à la main après chaque
reset). Plus aucun clonage SQL ni réalignement de séquence n'est nécessaire
après `npm run seed`.

| Email | userId | Rôle | État |
|---|---|---|---|
| admin@beown.fr | 1 | super_admin | actif |
| cio@beown.fr | 2 | cio | actif |
| marketing@beown.fr | 3 | marketing | actif (auteur des actualités) |
| analyste@beown.fr | 4 | analyste_financier | actif |
| relation@beown.fr | 5 | charge_relation_investisseur | actif |
| porteur1@beown.fr | 6 | porteur | Sow Promotion (Dakar) — projets A (exploitation) et C (collecte obligataire) |
| porteur2@beown.fr | 7 | porteur | Mensah Real Estate — projets B (brouillon), E (collecte), F (échec remboursé) |
| investisseur1@beown.fr | 8 | investisseur | **Fatou Ndiaye** — KYC validé, **avertie**, questionnaire rempli. Wallet **17 869,25 €**. Positions : A (3 000 parts + 100 rachetées), C (20 obligations + échéancier), E (300), G (1 000). 1 annonce en carnet, acheteuse de la cession exécutée, marque d'intérêt en cours, réservation validée sur D. Persona **retrait** |
| investisseur2@beown.fr | 9 | investisseur | **Ibrahima Ba** — KYC validé, non averti. Wallet **17 821,55 €**. Positions : A (1 800), E (50), G (600) ; F remboursé. **1 retrait réussi** (1 500 €), annonce avec **intérêt exprimé** à accepter/refuser |
| investisseur3@beown.fr | 10 | investisseur | **Aïssatou Fall** — KYC validé, non avertie. Wallet **20 287,70 € + 2 000 € bloqués** (délai de réflexion sur E). Positions : A (1 100 après cession), G (400) ; F remboursé. **1 retrait EN COURS** (2 000 €), 1 dépôt **échoué**, vendeuse de la cession exécutée |
| investisseur4@beown.fr | 11 | investisseur | **Jean-Hugues Técher** (Saint-Paul) — KYC **NON COMMENCÉ** : aucun dossier KYC, aucun wallet, aucun profil. Persona **gating** — NE PAS valider son KYC pendant les tests |
| porteur3@beown.fr | 12 | porteur | **Laurent Hoarau** — Hoarau Océan Indien Promotion SAS (Saint-Denis, La Réunion). Projets D (annonce + réservations) et G (financé, loyers déclarés, versement porteur historisé, trésorerie 9 200 €) |
| investisseur5@beown.fr | 13 | investisseur | **Marie Payet** (Saint-Pierre, La Réunion) — KYC **REFUSÉ** avec motif (pièce expirée). Wallet à 0, aucun investissement |
| investisseur6@beown.fr | 14 | investisseur | **Grondin Invest SAS** (Le Tampon, La Réunion) — personne **morale**, KYC **EN REVUE** manuelle (niveau renforcé), questionnaire PM rempli (avertie). Wallet à 0 |
| compliance@beown.fr | 15 | compliance | actif |
| financier@beown.fr | 16 | financier | actif |
| support@beown.fr | 17 | support | actif |
| dpo@beown.fr | 18 | dpo | actif |
| rcci@beown.fr | 19 | rcci | actif |
| cgp@beown.fr | 20 | cgp | actif |

## Projets seedés (7 — tous les statuts du cycle)

| Projet | Statut | Contenu notable |
|---|---|---|
| A — Résidence Les Jardins (Dakar) | `en_exploitation` | Equity 600 k€ 100 % financé. **3 périodes de distribution VERSÉES** avec IR 12,8 % / CSG 17,2 % / frais plateforme non nuls ; 3 loyers validés + 1 en attente admin ; versement porteur 590 k€ + 3 apports porteur ; **sortie projetée** (690 k€) ; document d'infos clés complet |
| B — Villas Cocody (Abidjan) | `brouillon` | Document d'infos clés **incomplet** (2 sections sur 8) — écran de complétude admin |
| C — Bureaux Plateau (Abidjan) | `en_collecte` | **Obligataire** 8,5 % : 10 k€ souscrits par inv1, **24 échéances de coupon** générées, échéancier emprunteur trimestriel sur le projet |
| D — Résidence Océane (Saint-Denis) | `annonce` | Pré-investissable (plafond 100 k€) : **3 réservations** (rangs 1-3, 9 500 €), 1 validée |
| E — Cœur de Ville (Saint-Pierre) | `en_collecte` | Partiellement financé : 35 k€ acquis + **2 000 € en délai de réflexion** (soldeBloque d'inv3 > 0) |
| F — Les Filaos (L'Étang-Salé) | `echec` | Collecte échouée : 18 k€ **remboursés** (`remboursement_collecte_echec`), investissements annulés, wallet projet à 0 |
| G — Les Flamboyants (Le Tampon) | `finance` | Porteur3 : 2 unités / 2 locataires / 2 baux actifs, **loyers M-1 VALIDÉS (2 800 €) + charge validée**, loyers M courant déclarés, **versement porteur historisé** (réf. VIR-2026-FLB-001) + apport 4 200 €. Aucune période calculée → **l'admin peut dérouler une distribution réelle de bout en bout** (calcul → validation → exécution ; wallet projet : 9 200 €) |

## Wallets système (l'angle mort est comblé)

Après seed, les wallets suivants existent **avec du solde** :

| Wallet | Solde attendu |
|---|---|
| `frais_plateforme` | 2 705,00 € (3 × 815 € de frais de distribution + 260 € de frais de cession) |
| `sequestre_ir` | 1 415,04 € (12,8 % sur 3 distributions) |
| `sequestre_csg` | 1 901,46 € (17,2 % sur 3 distributions) |
| techniques projet | A : 10 000 € · C : 10 000 € · E : 35 000 € · F : 0 € · G : 9 200 € |

**Invariant** : le seed rejoue `rapprocherGrandLivre` (le contrôle de la
réconciliation nocturne) sur ses propres écritures et **échoue** si un wallet
ne se rapproche pas — le jeu de données sort donc toujours à 0 écart. La
mécanique est testée sans base : `npx jest seed-ledger`
(`database/seeds/seed-ledger.spec.ts`).

## Contraintes à respecter pendant les tests

1. **Rate limiting sign-in : 10 tentatives / 15 min / IP** (palier `auth`, stockage Redis). Conséquence : créer les storage states Playwright UNE fois, les persister et les réutiliser. Ne jamais boucler sur le login.
2. **CAPTCHA** : reCAPTCHA en clés de **test** Google (validation toujours OK). L'inscription est automatisable ; côté API le champ `captchaToken` accepte n'importe quelle valeur non vide.
3. **Interdiction absolue** : `npm run migration:run` (cassé). Reset uniquement par `npm run schema:drop` puis `npm run seed`.
4. Le backend sert un build : ne pas s'attendre à voir des modifications de code sans rebuild + restart explicite et coordonné.
5. **Calculer une distribution** ne fonctionne que sur un projet equity en statut `finance` → utiliser le projet **G** (les périodes du projet A sont historiques, son statut `en_exploitation` bloque volontairement un recalcul).
6. **Vérification d'email d'un compte créé pendant les tests** : l'envoi de mail est absent en dev (Brevo non configuré), donc un compte issu de `POST /auth/sign-up` ne peut pas cliquer son lien et son sign-in est bloqué. Procédure connue (préparation de donnée de test, PAS un défaut applicatif) : `UPDATE user_emails SET "isVerified" = true WHERE "userId" = <id>;` puis sign-in normal. Ne jamais l'appliquer à `investisseur4` (persona « KYC non commencé » à préserver).

## Reset complet (destructif — à coordonner)

```bash
cd BeOwn-Backside
npm run schema:drop && npm run seed
```

C'est tout : le seed recrée les 20 comptes (rôles et investisseur4 compris),
les 7 projets et l'ensemble des flux. Aucune étape manuelle post-seed.

### Après TOUT insert SQL manuel : réaligner les séquences

(Ne concerne plus le reset standard — uniquement d'éventuels INSERT SQL à la
main ou une restauration partielle de sauvegarde.)

Un `INSERT` SQL qui fournit lui-même la clé primaire **ne fait pas avancer** la
séquence associée ; les inscriptions suivantes échouent en
`409 REGISTRATION_CONFLICT` (cause racine d'ANO-01). À exécuter alors :

```bash
docker exec -i <conteneur_postgres> psql -U <user> -d <db> <<'SQL'
SELECT setval('users_userId_seq',       COALESCE((SELECT MAX("userId") FROM users), 1),        true);
SELECT setval('user_emails_userId_seq', COALESCE((SELECT MAX("userId") FROM user_emails), 1),  true);
SQL
```

## Endpoints utiles (vérifiés)

- `POST /auth/sign-in` `{email, password}` → `{accessToken, refreshToken}`
- `POST /auth/sign-up` `{email, password, firstname, lastname, captchaToken}`
- `GET /users/me`, `GET /profiles/kyc/me`, `GET /wallets/user/:userId`
- `GET /payments/connect/status`, `POST /payments/connect/onboarding-link`, `POST /payments/retrait`

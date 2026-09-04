# ADR — Gel des avoirs : liste interne, blocage des sorties, crédits entrants versés

**Date** : 2026-09-03 · **Statut** : accepté · **Contexte** : lot 2, mission 4 (`.claude/plans/lot2-rgpd-signature.md`, dépôt Frontside) · **Base légale** : art. L. 562-4 Code monétaire et financier (mise en œuvre sans délai des mesures de gel).

## Contexte

BeOwn a l'obligation de mettre en œuvre les mesures de gel des avoirs. Aucun fournisseur de screening n'est souscrit (arbitrage budgétaire fondateur en attente) : la structure retenue est minimale et honnête — liste interne saisie à la main depuis le registre national des gels, blocage applicatif des mouvements, décision humaine.

## Décisions

### 1. Le gel bloque les SORTIES, jamais les crédits entrants

Quatre chemins d'argent sortant refusent un compte gelé, par une garde applicative **unique** (`GelDesAvoirsPort.assertAvoirsNonGeles`, module `src/common/aml/`) appelée en premier :

| Chemin | Point d'appel |
|---|---|
| Création de dépôt | `PaymentController.createDepotIntent` (`POST /payments/depot/intent`) |
| Souscription (couvre le réinvestissement auto des loyers) | `CreateInvestmentUseCase.execute` |
| Retrait | `RequestRetraitUseCase.execute` (y compris rejeu idempotent) |
| Achat marché secondaire | `ExprimerInteretUseCase.execute` **et** `InitiateBuyUseCase.execute` (fenêtre « intérêt exprimé avant gel, acceptation vendeur après ») |

Refus : **403, code stable `AVOIRS_GELES`**, message neutre **unique** (texte verbatim de `docs/conformite/2026-09-03-baremes-lot2.md` § 4.1 — aucune autorité citée, aucune variante qui révélerait le mécanisme). L'adresse de contact du message vient de `COMPLIANCE_CONTACT_EMAIL` (défaut : `compliance@beown.fr`, l'exemple du document de conformité — arbitrage fondateur en attente).

Les **crédits entrants restent versés** : c'est le principe même du gel — les avoirs restent sur le compte, ils n'en sortent plus. Les distributions de loyers dues à un investisseur gelé sont créditées sur son wallet comme pour tout autre (`ExecuteDistributionUseCase` ne porte volontairement **aucune** garde de gel — verrouillé par `execute-distribution.usecase.gel.spec.ts`). Rien de particulier n'est affiché à l'utilisateur à ce sujet.

Cas limite assumé : un PaymentIntent de dépôt déjà **payé** chez Stripe avant le gel est tout de même crédité par le webhook — refuser le crédit d'un paiement encaissé créerait un écart de réconciliation ; l'argent reste de toute façon prisonnier du wallet (retrait bloqué).

### 2. Le screening SIGNALE, l'humain GÈLE

- Fonction de correspondance **pure** (`src/common/aml/domains/sanctions-screening.ts`) : normalisation casse/accents/tirets, match nom+prénom exact **ou** nom+date de naissance. Testée sans DB.
- Déclencheurs : passage KYC → VALIDE (`UpdateKycStatusUseCase`, point unique couvrant webhook Stripe Identity et décision admin) et re-scan global admin (`POST /admin/compliance/gel/rescan`).
- Une correspondance **crée une alerte** (audit log `aml.gel.correspondance` + notification COMPLIANCE/RCCI/SUPER_ADMIN) — elle ne gèle **jamais** seule.
- Le gel est posé/levé exclusivement par `POST|DELETE /admin/compliance/gel/users/:userId` (permission `aml:manage`, **motif obligatoire**, audité par l'AuditInterceptor global + entrées d'audit métier `aml.gel.geler`/`aml.gel.degeler`).

### 3. Liste interne minimale

Table `personne_gelee` (nom, prénom, dateNaissance nullable, motif, source, actif, creePar, creeLe) — minimisation stricte : ces lignes concernent des personnes potentiellement tierces à la plateforme. Jamais de DELETE : désactivation logique (`actif=false`) pour trace. Source par défaut : « registre national des gels — saisie manuelle ».

### 4. Interactions avec le reste du système

- **Purge RGPD suspendue** : un compte gelé est exclu de toute purge/anonymisation le concernant (`RgpdPurgeService`, clause `avoirsGelesLe IS NULL` + compteur `suspendusGel` journalisé — règle transverse n° 3 du barème de conservation).
- Gel/dégel conservés au journal d'audit 5 ans (barème ligne 9) ; les tentatives d'opération refusées sont aussi tracées (`aml.gel.operation-refusee`).
- Schéma : décorateurs + SQL manuel réversible (`ADR-migrations-hors-deploiement.md`, entrée 2026-09-03 gel), appliqué sur la base dev.

## Dette assumée / hors périmètre

- Pas de fournisseur de screening (ni mise à jour automatique de la liste) : saisie manuelle au fil du registre national — la fréquence de mise à jour est un engagement opérationnel, pas logiciel.
- Le gel ne bloque pas la connexion ni la consultation : la personne voit son solde et ses positions (le message l'y invite).
- La mention en politique de confidentialité (§ 4.2 du document de conformité) attend la prochaine révision validée — non appliquée dans ce lot.

# ADR — Migrations TypeORM retirées du pipeline de déploiement

**Date** : 2026-08-31 · **Statut** : accepté (dette assumée) · **Décideur** : chantier post-audit, validé chef-de-projet

## Contexte

Le Jenkinsfile exécutait à chaque déploiement `kubectl exec … npm run migration:run` (et `npm run seed` sur dev/staging/test). Or `migration:run` est **cassé** depuis fin juin 2026 : le schéma de développement n'est construit que par le `synchronize` du seed. En production, l'étape aurait échoué **après** la mise à jour des pods — application en service, pipeline rouge, aucun moyen de dire si le déploiement est valide. Sur les environnements partagés, le seed réécrivait le schéma à chaque rollout.

## Décision

Retirer les deux appels du pipeline. Le déploiement ne touche plus jamais au schéma. Le seed redevient une action **manuelle et volontaire** (`npm run schema:drop && npm run seed`, dev uniquement).

## Conséquences / dette assumée

- Aucun chemin outillé ne fait évoluer le schéma d'un environnement déployé : toute évolution de schéma est aujourd'hui **bloquante pour la production** tant que la dette n'est pas soldée.
- Le pipeline dit désormais la vérité : un déploiement vert signifie « application déployée », rien de plus.

## Sortie de dette (préalable à tout lancement)

1. Réparer la chaîne de migrations TypeORM (ou repartir d'une migration initiale générée depuis le schéma seed).
2. Rétablir un stage `migrate` **séparé** du déploiement applicatif, réversible, joué avant la bascule des pods, couvert en CI par un up/down sur base jetable.

## Évolutions de schéma en attente de la sortie de dette

Déclarées dans les entités (le `synchronize` du seed les pose en dev), à jouer **manuellement** sur tout environnement déployé :

- 2026-09-01 — index `transaction_paiement (statut, createdAt)` et `(type, statut)` (file des retraits, reaper, exports) ; index `distribution_part (payeLe)` (suivi fiscal) ; colonne `ordre_marche.accepteLe` timestamptz NULL (délai de grâce du balayeur des ordres orphelins). Équivalent SQL : `CREATE INDEX CONCURRENTLY` sur les deux triplets + `ALTER TABLE ordre_marche ADD COLUMN "accepteLe" timestamptz NULL` — réversibles par `DROP INDEX` / `DROP COLUMN`.
- 2026-09-03 — **Parrainage + réinvestissement (vague C)**. SQL ordonné, réversible :
  ```sql
  ALTER TABLE users ADD COLUMN "codeParrainage" varchar(12) NULL;
  ALTER TABLE users ADD CONSTRAINT "UQ_users_codeParrainage" UNIQUE ("codeParrainage");
  ALTER TABLE users ADD COLUMN "parrainePar" integer NULL;
  CREATE TABLE parrainage_attribution (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "parrainId" integer NOT NULL,
    "filleulId" integer NOT NULL UNIQUE,
    "investissementId" uuid NOT NULL,
    "montantBase" numeric(18,2) NOT NULL,
    "bonusParrainEur" numeric(18,2) NOT NULL DEFAULT 0,
    "bonusFilleulEur" numeric(18,2) NOT NULL DEFAULT 0,
    statut varchar NOT NULL DEFAULT 'creditee',
    "creeLe" timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX "IDX_parrainage_parrain_creele" ON parrainage_attribution ("parrainId", "creeLe");
  ALTER TABLE user_preferences ADD COLUMN "reinvestLoyers" boolean NOT NULL DEFAULT false;
  ALTER TABLE user_preferences ADD COLUMN "reinvestProjetId" uuid NULL;
  ```
  Retour arrière : `DROP TABLE parrainage_attribution;` + `ALTER TABLE … DROP COLUMN` sur les quatre colonnes.
  Note : pas de backfill des codes du stock existant — `GET /parrainage/me` génère le code à la première lecture (filet documenté dans AssurerCodeParrainageService).
- 2026-09-03 — **Signature de repli « acceptation certifiée » (lot 2, mission 1)**. Colonnes sur `signature` (port `SignatureProvider`, provider `acknowledge`). SQL ordonné, réversible :
  ```sql
  ALTER TABLE signature ADD COLUMN "provider" varchar NOT NULL DEFAULT 'yousign';
  ALTER TABLE signature ADD COLUMN "documentHash" varchar NULL;
  ALTER TABLE signature ADD COLUMN "acknowledgedAt" timestamptz NULL;
  ALTER TABLE signature ADD COLUMN "acknowledgedIp" varchar NULL;
  ALTER TABLE signature ADD COLUMN "certificatDocumentId" uuid NULL;
  ```
  Retour arrière : `ALTER TABLE signature DROP COLUMN` sur les cinq colonnes.
  Note : défaut `'yousign'` — tout le stock existant a été ouvert chez YouSign ; les colonnes d'acceptation (`documentHash`, `acknowledgedAt`, `acknowledgedIp`, `certificatDocumentId`) ne sont renseignées que par le parcours de repli (`SIGNATURE_PROVIDER=acknowledge`). Appliqué sur la base dev le 2026-09-03.

- 2026-09-03 — **Preuve de consentement CGU (lot 2, mission 2)**. Colonnes sur `users`, à côté du `cguAccepteesLe` préexistant (jusqu'ici jamais écrit). SQL ordonné, réversible :
  ```sql
  ALTER TABLE users ADD COLUMN "cguVersionAcceptee" varchar(20) NULL;
  ALTER TABLE users ADD COLUMN "cguAcceptationIp" varchar(45) NULL;
  ```
  Retour arrière : `ALTER TABLE users DROP COLUMN` sur les deux colonnes.
  Note : nullable SANS backfill — un consentement ne se reconstitue pas a posteriori (art. 7.1 RGPD) ; les comptes antérieurs au lot 2 et les comptes OAuth restent à NULL. varchar(45) = IPv6 textuelle maximale. Appliqué sur la base dev le 2026-09-03.

- 2026-09-03 — **Anonymisation RGPD + purge par finalité (lot 2, mission 3)**. Module `src/rgpd/` : marqueur d'anonymisation sur `users` (idempotence + date de clôture de la relation d'affaires, point de départ des 5 ans L. 561-12 CMF) et marqueur d'archivage « conservation légale » sur `document` (pièce KYC d'un compte supprimé, conservée puis purgée par le cron à clôture + 5 ans). SQL ordonné, réversible :
  ```sql
  ALTER TABLE users ADD COLUMN "anonymiseLe" timestamptz NULL;
  ALTER TABLE document ADD COLUMN "archiveConservationLegale" boolean NOT NULL DEFAULT false;
  ```
  Retour arrière : `ALTER TABLE users DROP COLUMN "anonymiseLe"; ALTER TABLE document DROP COLUMN "archiveConservationLegale";`
  Note : aucun backfill — le stock de comptes déjà SUPPRIME et non anonymisés est rattrapé automatiquement par le cron de purge (finalité `compte_supprime_a_anonymiser`, sélection auto-extinctive). Appliqué sur la base dev le 2026-09-03.

- 2026-09-03 — **Gel des avoirs (lot 2, mission 4 — art. L. 562-4 CMF)**. Statut gelé sur `users` (posé/levé uniquement par l'endpoint admin compliance, jamais par le screening) et liste interne `personne_gelee` (saisie manuelle registre national des gels — cf. `docs/adr/ADR-gel-des-avoirs.md`). SQL ordonné, réversible :
  ```sql
  ALTER TABLE users ADD COLUMN "avoirsGelesLe" timestamptz NULL;
  ALTER TABLE users ADD COLUMN "avoirsGelesMotif" varchar(500) NULL;
  CREATE TABLE personne_gelee (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nom varchar NOT NULL,
    prenom varchar NOT NULL,
    "dateNaissance" date NULL,
    motif varchar(500) NOT NULL,
    source varchar NOT NULL,
    actif boolean NOT NULL DEFAULT true,
    "creePar" integer NOT NULL,
    "creeLe" timestamptz NOT NULL DEFAULT now()
  );
  ```
  Retour arrière : `DROP TABLE personne_gelee; ALTER TABLE users DROP COLUMN "avoirsGelesLe"; ALTER TABLE users DROP COLUMN "avoirsGelesMotif";`
  Note : `avoirsGelesLe` NULL = compte non gelé (aucun backfill nécessaire) ; la purge RGPD suspend tout traitement d'un compte où il est non NULL (`suspendusGel` dans le rapport de `RgpdPurgeService`). Les lignes `personne_gelee` ne se suppriment jamais — désactivation logique (`actif=false`) pour trace. Appliqué sur la base dev le 2026-09-03.

- 2026-09-04 — **Accès porteur : demande instruite + double accès (lot 4, décision fondateur D1)**. Drapeau d'accès cumulé sur `users` et table des demandes `demande_acces_porteur` (module `src/porteur-access/`). SQL ordonné, réversible :
  ```sql
  -- (a) Drapeau d'accès porteur cumulé. Un investisseur dont la demande est
  -- acceptée CONSERVE son rôle `investisseur` et gagne ce drapeau ; il est RELU
  -- EN BASE par PorteurAccessGuard à chaque requête de l'espace porteur.
  ALTER TABLE users ADD COLUMN "porteurAccess" boolean NOT NULL DEFAULT false;

  -- (b) Dossiers de demande. Aucune FK dure (comme le reste du schéma).
  CREATE TABLE demande_acces_porteur (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "utilisateurId" integer NOT NULL,
    statut varchar NOT NULL DEFAULT 'soumise',
    motivation text NOT NULL,
    "cguVersionAcceptee" varchar(20) NOT NULL DEFAULT '1.0',
    "soumiseLe" timestamptz NOT NULL,
    "decideeLe" timestamptz NULL,
    "decideurAdminId" integer NULL,
    "motifRefus" varchar(40) NULL,
    "motifRefusComplement" varchar(1000) NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX "IDX_demande_acces_porteur_utilisateur" ON demande_acces_porteur ("utilisateurId");
  CREATE INDEX "IDX_demande_acces_porteur_statut_soumise" ON demande_acces_porteur (statut, "soumiseLe");
  CREATE INDEX "IDX_demande_acces_porteur_soumise" ON demande_acces_porteur ("soumiseLe");
  CREATE INDEX "IDX_demande_acces_porteur_decidee" ON demande_acces_porteur ("decideeLe");
  -- UNICITÉ PARTIELLE : une seule demande NON TERMINALE par compte. C'est le
  -- SEUL contrôle qui tienne sous concurrence — sans lui, deux requêtes
  -- simultanées passent toutes deux la vérification applicative et ouvrent
  -- deux dossiers. La clause doit rester identique à `STATUTS_NON_TERMINAUX`
  -- du domaine : `demande-acces-porteur.index.spec.ts` lit la clause dans la
  -- métadonnée TypeORM du décorateur et la compare au domaine.
  CREATE UNIQUE INDEX "UQ_demande_acces_porteur_en_cours"
    ON demande_acces_porteur ("utilisateurId")
    WHERE statut IN ('soumise', 'en_examen');
  ```
  Retour arrière : `DROP TABLE demande_acces_porteur;` (les index partent avec) puis `ALTER TABLE users DROP COLUMN "porteurAccess";`
  Notes :
  - **Aucun backfill** : `porteurAccess = false` est l'état exact du stock existant — le double accès n'existait pas, et il ne s'accorde que par une décision instruite (`PATCH /admin/porteur-access/demandes/:id`, permission `porteur_access:review`). Les porteurs « purs » gardent leur accès par leur rôle.
  - En production, préférer `CREATE INDEX CONCURRENTLY` pour les quatre index non contraignants ; l'index UNIQUE partiel doit être posé sur table vide (c'est le cas à la création) ou en `CREATE UNIQUE INDEX CONCURRENTLY` puis vérification.
  - `ALTER TABLE users ADD COLUMN … DEFAULT false` est instantané depuis PostgreSQL 11 (défaut non volatile, pas de réécriture de table).
  - `statut` prend l'une de six valeurs : `soumise`, `en_examen`, `acceptee`, `refusee`, `retiree`, `caduque` — cette dernière étant posée lorsque le compte demandeur est supprimé et anonymisé avant toute décision (un CONSTAT de la plateforme, distinct d'un retrait par la personne). Aucune contrainte `CHECK` : le vocabulaire est tenu par la machine à états du domaine, comme partout ailleurs dans ce schéma.
  - `motifRefus` est un CODE de liste fermée (`identite_non_verifiee`, `dossier_incomplet`, `hors_criteres`, `obstacle_legal_lcbft`) — d'où `varchar(40)` et non du texte libre ; `motifRefusComplement` et `motivation` sont les deux seules colonnes de texte libre, purgées par la finalité `demande_porteur_texte_libre` (2 ans après un refus) SANS supprimer la ligne de décision.
  - **Appliqué sur la base dev le 2026-09-04** (schéma rejoué par `npm run schema:drop && npm run seed`, parcours validé en recette réelle). Sur tout environnement déployé, poser le SQL ci-dessus. Le dépôt ne dispose toujours d'aucun harnais de base jetable : les suites automatisées éprouvent le domaine, l'application et les métadonnées de schéma, jamais PostgreSQL lui-même.

- 2026-09-04 — **Accès porteur : retrait motivé et réversible (lot 4b)**. Horodatage du dernier retrait sur `users`. SQL ordonné, réversible :
  ```sql
  ALTER TABLE users ADD COLUMN "accesRevoqueLe" timestamptz NULL;
  ```
  Retour arrière : `ALTER TABLE users DROP COLUMN "accesRevoqueLe";`
  Notes :
  - **Aucun backfill** : `NULL` est l'état exact du stock existant — aucun accès n'avait jamais été retiré, faute de chemin de révocation. `NULL` signifie « accès en cours, ou jamais ouvert » ; invariant tenu par l'application : `porteurAccess = true` ⟹ `accesRevoqueLe IS NULL`.
  - **Aucun index** : la colonne n'est jamais un critère de sélection à elle seule — elle est lue par jointure sur la clé primaire de `users` (purge RGPD) et par la lecture ciblée du garde d'accès.
  - **Pas de table d'historique** : la chronologie des octrois et des retraits vit déjà dans `audit_log` (5 ans, entrées `porteur_access.acces.retire` / `.retabli` et `porteur_access.demande.acceptee` / `.refusee`, avec `porteurAccessAvant` / `porteurAccessApres`). Une seconde table serait une seconde source de vérité à tenir en phase pour une question qui se résume à « quand l'accès s'est-il refermé ? ». Cette date sert de POINT DE DÉPART au barème de conservation d'une demande acceptée (« durée de l'accès, puis 5 ans ») : `RgpdPurgeService` la lit par `COALESCE("accesRevoqueLe", "anonymiseLe", "decideeLe")`.
  - `ALTER TABLE … ADD COLUMN … NULL` sans défaut est instantané, quelle que soit la version de PostgreSQL.

- 2026-09-05 — **Socle d'intégrité des portefeuilles (passe 2 « flux d'argent »)**. Deux index uniques partiels et une contrainte de non-négativité. SQL ordonné, réversible :
  ```sql
  -- 1. Un compte ne porte qu'UN portefeuille par type.
  --    Symétrique de UQ_wallet_projet_type, déjà en place. Le portefeuille
  --    investisseur est résolu partout par findOne({proprietaireUserId, type}),
  --    qui rend la PREMIÈRE ligne : un doublon né d'une course (le dépôt comme
  --    la première consultation créent le portefeuille à la volée) scinderait
  --    le solde d'une personne en deux — crédit sur l'un, débit sur l'autre,
  --    « solde insuffisant » sur un compte pourtant approvisionné.
  CREATE UNIQUE INDEX CONCURRENTLY "UQ_wallet_proprietaire_type"
    ON wallet ("proprietaireUserId", type)
    WHERE "proprietaireUserId" IS NOT NULL;

  -- 2. Non-négativité — SUR LES SEULS PORTEFEUILLES D'UTILISATEURS.
  ALTER TABLE wallet ADD CONSTRAINT chk_wallet_utilisateur_positif
    CHECK (
      "proprietaireUserId" IS NULL
      OR (solde >= 0 AND "soldeBloque" >= 0)
    ) NOT VALID;
  ALTER TABLE wallet VALIDATE CONSTRAINT chk_wallet_utilisateur_positif;
  ```
  Retour arrière :
  ```sql
  ALTER TABLE wallet DROP CONSTRAINT chk_wallet_utilisateur_positif;
  DROP INDEX CONCURRENTLY "UQ_wallet_proprietaire_type";
  ```

  **ARBITRAGE — pourquoi la contrainte ne couvre PAS les portefeuilles de projet.**
  La consigne d'audit proposait `CHECK (solde >= 0 AND "soldeBloque" >= 0)` sur toute la table. Ce serait contradictoire avec une décision déjà prise, écrite et testée : le découvert d'un portefeuille de PROJET est **toléré et rendu visible**, jamais bloqué (`pay-echeance.usecase.ts`, `execute-distribution.usecase.ts`, et depuis cette passe `execute-sortie.usecase.ts`). La raison y est développée : le règlement d'une échéance ou la distribution d'une sortie est une **obligation envers des investisseurs**, pas une dépense discrétionnaire. Refuser le débit transformerait un défaut d'alimentation par le porteur — son problème — en impayé pour l'investisseur — le problème de la plateforme. Le découvert est donc journalisé, compté dans la jauge `PROJECT_WALLET_SHORTFALL_EUR` et visible dans l'état financier du projet.

  Poser la contrainte sur toute la table ferait échouer ces règlements en base, après les gardes applicatives, sous forme d'exception d'intégrité — c'est-à-dire au pire endroit. La contrainte est donc **restreinte par la clause `proprietaireUserId IS NULL OR …`**, qui couvre exactement les portefeuilles personnels : ceux-là ne doivent JAMAIS passer sous zéro, et toutes les écritures qui les touchent sont déjà conditionnelles (`solde >= :montant`). La contrainte est le filet de dernier ressort, pas le contrôle principal.

  Un `CHECK` de ligne suffit : pas de trigger, pas de fonction, rien à maintenir.

  Notes :
  - `NOT VALID` puis `VALIDATE` : la validation ne prend pas de verrou exclusif de table et n'interrompt pas le service. À jouer dans cet ordre, et à ne valider qu'après avoir vérifié qu'aucune ligne existante ne viole la contrainte :
    ```sql
    SELECT id, "proprietaireUserId", solde, "soldeBloque" FROM wallet
    WHERE "proprietaireUserId" IS NOT NULL AND (solde < 0 OR "soldeBloque" < 0);
    ```
    Toute ligne remontée est un incident à instruire AVANT la pose — la contrainte ne doit pas servir à découvrir un problème, seulement à empêcher les suivants.
  - `CREATE UNIQUE INDEX CONCURRENTLY` ne peut pas s'exécuter dans une transaction, et échoue s'il existe déjà des doublons. Les repérer d'abord :
    ```sql
    SELECT "proprietaireUserId", type, count(*) FROM wallet
    WHERE "proprietaireUserId" IS NOT NULL
    GROUP BY 1, 2 HAVING count(*) > 1;
    ```
  - **Non appliqué sur la base dev** au moment de l'écriture : la clause partielle est déclarée dans l'entité (`@Index('UQ_wallet_proprietaire_type', …)`), donc posée par le `synchronize` du seed au prochain `npm run schema:drop && npm run seed`. La contrainte `CHECK`, elle, n'est PAS exprimable en décorateur TypeORM dans ce dépôt : elle doit être posée à la main, y compris en dev.

- 2026-09-05 — **Verrou distribué des tâches planifiées**. Aucun changement de schéma : `VerrouCronService` s'appuie sur `pg_try_advisory_lock`, un verrou consultatif de session, sans table ni colonne. Mentionné ici parce que c'est une dépendance PostgreSQL nouvelle du code applicatif. Rien à jouer, rien à défaire.

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
  -- du domaine (un test éprouve la parité).
  CREATE UNIQUE INDEX "UQ_demande_acces_porteur_en_cours"
    ON demande_acces_porteur ("utilisateurId")
    WHERE statut IN ('soumise', 'en_examen');
  ```
  Retour arrière : `DROP TABLE demande_acces_porteur;` (les index partent avec) puis `ALTER TABLE users DROP COLUMN "porteurAccess";`
  Notes :
  - **Aucun backfill** : `porteurAccess = false` est l'état exact du stock existant — le double accès n'existait pas, et il ne s'accorde que par une décision instruite (`PATCH /admin/porteur-access/demandes/:id`, permission `porteur_access:review`). Les porteurs « purs » gardent leur accès par leur rôle.
  - En production, préférer `CREATE INDEX CONCURRENTLY` pour les quatre index non contraignants ; l'index UNIQUE partiel doit être posé sur table vide (c'est le cas à la création) ou en `CREATE UNIQUE INDEX CONCURRENTLY` puis vérification.
  - `ALTER TABLE users ADD COLUMN … DEFAULT false` est instantané depuis PostgreSQL 11 (défaut non volatile, pas de réécriture de table).
  - `statut` prend l'une de cinq valeurs : `soumise`, `en_examen`, `acceptee`, `refusee`, `retiree`, `caduque` — cette dernière étant posée lorsque le compte demandeur est supprimé et anonymisé avant toute décision (un CONSTAT de la plateforme, distinct d'un retrait par la personne). Aucune contrainte `CHECK` : le vocabulaire est tenu par la machine à états du domaine, comme partout ailleurs dans ce schéma.
  - `motifRefus` est un CODE de liste fermée (`identite_non_verifiee`, `dossier_incomplet`, `hors_criteres`, `obstacle_legal_lcbft`) — d'où `varchar(40)` et non du texte libre ; `motifRefusComplement` et `motivation` sont les deux seules colonnes de texte libre, purgées par la finalité `demande_porteur_texte_libre` (2 ans après un refus) SANS supprimer la ligne de décision.
  - **Non appliqué sur la base dev à ce jour** : ce lot n'a pas été joué contre une base (aucun harnais de base jetable dans le dépôt). À poser par `npm run schema:drop && npm run seed` en dev, et par le SQL ci-dessus ailleurs.

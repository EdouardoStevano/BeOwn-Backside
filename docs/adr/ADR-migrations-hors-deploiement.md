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

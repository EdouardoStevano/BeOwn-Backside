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

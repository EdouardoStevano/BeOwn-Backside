# ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`)

- **Statut** : accepté
- **Date** : 2026-08-30
- **Périmètre** : backend `BeOwn-Backside`, modules `src/payments` et `src/wallets`
  (répercussions mécaniques sur `src/admin` et `src/iam`)
- **Décide pour** : la forme des écritures de `transaction_paiement` et le sens de
  l'écriture d'un dépôt
- **Ne décide pas** : le prestataire de paiement, ni la réconciliation avec le solde
  Stripe (point F5.5, toujours ouvert)
- **Corrige** : ANO-02 de la campagne de lancement du 2026-08-30

## Contexte — trois colonnes de portefeuille pour deux rôles

`transaction_paiement` portait **trois** colonnes de portefeuille, dont deux du même
côté :

| Colonne SQL | Propriété TypeORM | Rôle |
|---|---|---|
| `"walletSource"` | `walletSource` | portefeuille débité |
| `"wallet_source"` | `walletId` | **doublon orphelin** du précédent |
| `"walletDestination"` | `walletDestination` | portefeuille crédité |

Le doublon remonte au schéma initial (`src/migrations/1780898979269-InitSchema.ts:74`,
`database/migrations/1000000000000-BaseSchema.ts:360`). Le code le savait et le
contournait au cas par cas : `admin-retraits.controller.ts` lisait
`tx.walletSource ?? tx.walletId`, `wallet.repository.ts` ajoutait un troisième terme
`OR t.walletId = :id` à sa recherche.

Conséquence mesurée : `payment.controller.ts` inscrivait le **bénéficiaire** d'un dépôt
sur `walletId`, donc dans la colonne `wallet_source`, **du côté débiteur**, en laissant
`walletDestination` à NULL. Le solde était correctement crédité ; le registre
enregistrait l'opération à l'envers. Le rapprochement « Σ crédits − Σ débits = solde »
divergeait de **deux fois** le montant à chaque dépôt (le montant n'était pas compté au
crédit, et il était compté au débit).

Aucun test ne rapprochait le registre du solde : le défaut était structurellement
invisible.

## Décision 1 — Deux colonnes, et deux seulement

`walletId` est **supprimée** de `TransactionEntity`. Une écriture a un débiteur
(`walletSource`) et un créditeur (`walletDestination`) ; une contrepartie hors
plateforme (dépôt par carte, retrait bancaire, versement au porteur constaté) laisse
l'autre côté à NULL. C'est le **seul** cas légitime de côté vide.

**Pourquoi supprimer plutôt que renommer.** Renommer `walletId` en, par exemple,
`walletSourceLegacy` aurait conservé deux colonnes pour un seul rôle : toute lecture
resterait obligée d'écrire `a ?? b`, tout auteur d'une nouvelle écriture aurait deux
cibles possibles, et le prochain point d'écriture rejouerait le même bug. Le doublon
n'est pas un problème de nommage mais un problème de **cardinalité** : deux colonnes
pour un rôle unique n'ont pas de règle de départage, donc pas d'invariant. Une seule
colonne par rôle est la condition pour que « Σ crédits − Σ débits = solde » soit
énonçable.

Aucune donnée n'est perdue : `wallet_source` ne portait que des dépôts (voir le
décompte ci-dessous), rattrapés dans `walletDestination`.

## Décision 2 — Le sens de chaque écriture est fixé par type

| Type | `walletSource` | `walletDestination` | Point d'écriture |
|---|---|---|---|
| `depot` | NULL (carte) | portefeuille crédité | `payments/presenters/http/payment.controller.ts` |
| `retrait` (investisseur) | portefeuille débité | NULL (compte bancaire) | `payments/applications/usecases/request-retrait.usecase.ts`, `iam/.../delete-account.usecase.ts` |
| `retrait` (versement porteur) | wallet technique projet | NULL (banque du porteur) | `wallets/applications/project-ledger.service.ts` |
| interne (souscription, escrow, frais…) | débiteur | créditeur | usecases `investments` |

## Décision 3 — Le rapprochement devient une primitive du domaine

`src/wallets/domains/grand-livre.ts` expose `positionsDepuisEcritures`,
`rapprocherGrandLivre` et `grandLivreRapproche` : fonctions pures, sans base ni réseau,
qui reconstituent la position de chaque portefeuille depuis les seules écritures et la
comparent à `solde + soldeBloque`.

C'est ce que le lot 7a revendiquait sans l'outiller : l'invariant existant
(`grandLivreEquilibre`) ne vérifiait que la conservation des fonds sur une opération
INTERNE — il ne pouvait rien dire d'un dépôt, dont la contrepartie est externe.

## Conséquence sur le schéma — PAS de `migration:run`

`migration:run` est cassé sur ce dépôt : le schéma de développement est bâti par le
`synchronize` du seed. La suppression de la propriété `walletId` fait donc **tomber la
colonne `wallet_source`** au prochain `npm run schema:drop && npm run seed`.

**L'ordre est impératif** : le rattrapage ci-dessous lit `wallet_source`. Il doit être
joué **avant** toute synchronisation de schéma sur une base que l'on souhaite conserver
(staging, production). Sur un environnement de développement rechargé depuis le seed,
il n'y a rien à rattraper — le seed écrit déjà les dépôts sur `walletDestination`.

## Rattrapage des données existantes

Décompte de contrôle, à jouer **avant** :

```sql
-- Lignes portant le doublon, par type et statut.
SELECT type, statut, COUNT(*) AS lignes, SUM(montant) AS montant,
       COUNT(*) FILTER (WHERE "walletSource" IS NOT NULL)      AS aussi_walletsource,
       COUNT(*) FILTER (WHERE "walletDestination" IS NOT NULL) AS aussi_walletdestination
  FROM transaction_paiement
 WHERE wallet_source IS NOT NULL
 GROUP BY type, statut ORDER BY type, statut;
```

Correction, en une transaction :

```sql
BEGIN;

-- 1. Dépôts : le portefeuille inscrit est le BÉNÉFICIAIRE → côté crédit.
UPDATE transaction_paiement
   SET "walletDestination" = wallet_source
 WHERE type = 'depot'
   AND wallet_source IS NOT NULL
   AND "walletDestination" IS NULL
   AND "walletSource" IS NULL;

-- 2. Tout autre type : le portefeuille inscrit est le DÉBITÉ → côté source.
UPDATE transaction_paiement
   SET "walletSource" = wallet_source
 WHERE type <> 'depot'
   AND wallet_source IS NOT NULL
   AND "walletSource" IS NULL;

-- 3. Contrôle bloquant : plus aucune ligne ambiguë ni orpheline.
--    Doit renvoyer 0. Sinon : ROLLBACK et instruction manuelle.
SELECT COUNT(*) FROM transaction_paiement
 WHERE wallet_source IS NOT NULL
   AND "walletSource" IS DISTINCT FROM wallet_source
   AND "walletDestination" IS DISTINCT FROM wallet_source;

COMMIT;
```

La colonne est ensuite supprimée par le `synchronize` du seed ; sur une base à
conserver, la retirer explicitement une fois le contrôle à 0 :

```sql
ALTER TABLE transaction_paiement DROP COLUMN "wallet_source";
```

Contrôle d'acceptation, à rejouer après : la requête de rapprochement du §5.3 de
`docs/testing/2026-08-30-campagne-lancement.md` doit renvoyer `ecart = 0.00` sur
**tous** les portefeuilles.

## Dette assumée

Le rapprochement est aujourd'hui une primitive de domaine appelée par les tests. Il
n'est **pas** exposé comme contrôle d'exploitation (endpoint d'audit ou tâche
planifiée) : un écart introduit en base hors application ne serait pas alerté. À
traiter avec le point F5.5 (réconciliation registre interne ↔ solde Stripe).

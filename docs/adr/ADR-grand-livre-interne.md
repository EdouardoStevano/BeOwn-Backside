# ADR — Grand livre interne : crédit du wallet projet et invariant comptable

- **Statut** : accepté, avec une dette assumée et nommée (§ Dette assumée)
- **Date** : 2026-08-29
- **Périmètre** : Lot 7a — backend `BeOwn-Backside`, modules `src/investments` et `src/wallets`
- **Décide pour** : la matérialisation en base des fonds collectés au profit du porteur
- **Ne décide pas** : le prestataire de paiement cible (décision D2 du plan de lancement),
  ni le cantonnement des fonds, ni la réconciliation avec une source externe

## Contexte — le registre n'était pas équilibré

`WalletType` déclarait `TECHNIQUE_PROJET` et `SPV` depuis l'origine, mais **aucun
chemin de code applicatif ne les instanciait** : seul le seed créait un wallet
technique de projet. À la souscription, `create-investment.usecase.ts` et
`top-up-investment.usecase.ts` écrivaient `tx.walletDestination = null`.

Conséquence, vérifiable ligne à ligne :

| Opération | Investisseur | Contrepartie | Effet net |
|---|---|---|---|
| Souscription (averti) | `solde −M` | **aucune** | **−M : de l'argent disparaissait** |
| Souscription (non averti) | `solde −M`, `soldeBloque +M` | intra-wallet | 0 |
| Libération d'escrow (cron) | `soldeBloque −M` | **aucune** | **−M : de l'argent disparaissait** |
| Rétractation | `solde +M`, `soldeBloque −M` | intra-wallet | 0 |
| Remboursement de collecte, engagement sous délai | `solde +M`, `soldeBloque` **inchangé** | aucune | **+M : de l'argent était créé** |

La somme des soldes n'était donc pas invariante, aucune réconciliation n'était
possible, et **le montant dû au porteur n'était calculable par aucun moyen**.
Le commentaire du cron de confirmation promettait d'ailleurs « ESCROW_RELEASE +
SOUSCRIPTION » : la seconde écriture n'existait pas.

## Décision 1 — L'invariant porte sur `solde + soldeBloque`, pas sur `solde` seul

L'unité de mesure retenue est le **fonds détenu** par un wallet :

```
fondsDetenus(w) = w.solde + w.soldeBloque
```

Pour toute opération purement interne, `Σ Δ fondsDetenus = 0` sur l'ensemble des
wallets.

**Pourquoi pas `solde` seul**, comme le formulait la commande. Parce que le
blocage d'escrow de l'art. 22 déplace des fonds d'une poche à l'autre **à
l'intérieur du même wallet** : le `solde` baisse de M sans qu'aucun euro ne
sorte. Un invariant sur le seul `solde` serait faux par construction — il
qualifierait de « fuite » un mécanisme légal et correct. Formuler l'invariant sur
la somme des deux poches est la seule lecture qui tienne, et elle est plus
exigeante : elle couvre aussi les mouvements intra-wallet.

Seuls les mouvements à contrepartie **externe** (dépôt par carte, retrait
bancaire, versement au porteur constaté) font légitimement varier le total
détenu. Ils sont hors invariant, et identifiables : `walletDestination = null`
avec `fournisseur ≠ interne`.

Implémentation : `src/wallets/domains/grand-livre.ts`, fonctions pures, testées
sans base de données.

## Décision 2 — Le wallet projet est crédité quand l'engagement devient définitif

| Moment | Mouvement | Écriture |
|---|---|---|
| Souscription d'un investisseur **averti** | investisseur `−M` → wallet projet `+M` | `SOUSCRIPTION`, source et destination renseignées |
| Souscription sous **délai de réflexion** | investisseur : `solde −M`, `soldeBloque +M` | `ESCROW_LOCK`, source = destination = wallet investisseur |
| **Expiration du délai** (cron) | investisseur `soldeBloque −M` → wallet projet `solde +M` | `ESCROW_RELEASE`, destination = wallet projet |
| **Rétractation** | investisseur : `soldeBloque −M`, `solde +M` | `REMBOURSEMENT_CAPITAL`, source = destination |
| **Ajout de fractions** | investisseur `−M` → wallet projet `+M` | `SOUSCRIPTION`, destination renseignée |
| **Remboursement de collecte**, engagement définitif | wallet projet `−M` → investisseur `+M` | `REMBOURSEMENT_COLLECTE_ECHEC` |
| **Remboursement de collecte**, engagement sous délai | investisseur : `soldeBloque −M`, `solde +M` | `REMBOURSEMENT_COLLECTE_ECHEC`, source = destination |

### Écart assumé avec la lettre du critère d'acceptation

Le critère demandait que **toute** souscription crédite le wallet du projet,
immédiatement. Ce n'est pas ce qui est livré pour la souscription d'un
investisseur non averti, et c'est délibéré.

Créditer le wallet du porteur pendant que la rétractation reste ouverte
contredirait l'art. 22 du règlement (UE) 2020/1503, et contredirait le
commentaire que le code porte déjà à cet endroit : « le montant n'est pas dépensé
mais BLOQUÉ : il quitte le solde disponible **sans être mis à disposition du
porteur**, le temps du délai de réflexion ». Deux options ont été pesées :

1. **Escrow porté par le wallet du projet** (`soldeBloque` du projet crédité dès
   la souscription). Satisfait le critère à la lettre, mais vide de sens le champ
   `soldeBloque` du wallet investisseur, exposé par `GET /wallets/user/:userId`,
   et déplace la garde de l'argent vers le porteur pendant une période où
   l'engagement n'est pas ferme.
2. **Crédit différé à l'expiration du délai** — retenu. Diff plus petit, aucune
   modification du comportement observable côté investisseur, `cancel-investment`
   quasi intact, et la chronologie du grand livre reflète la réalité juridique.

L'esprit du critère — plus aucun euro sans contrepartie, plus aucun
`walletDestination` orphelin — est intégralement satisfait dans les deux cas. La
substance de la souscription atteint le wallet du projet dans **tous** les
chemins ; seule la date d'inscription diffère, et elle est celle du droit.

## Décision 3 — Idempotence du wallet projet par le verrou de la ligne projet

Un doublon de wallet scinderait le solde d'un projet en deux et rendrait le
montant dû au porteur incalculable. Deux barrières superposées :

1. **Le verrou pessimiste sur la ligne projet**, déjà point de rendez-vous unique
   de toutes les écritures financières d'un projet (souscription, ajout de
   fractions, remboursement, confirmation de délai). `ResolveProjectWalletUseCase`
   le prend systématiquement, sauf quand l'appelant le détient déjà.
2. **Un index unique partiel `(projetId, type) WHERE projetId IS NOT NULL`**, qui
   transforme une course résiduelle en erreur bruyante plutôt qu'en
   désalignement silencieux.

L'ordre de prise de verrous a été **uniformisé à projet → wallet** dans
`ConfirmRetractationCronService`, qui prenait auparavant le wallet avant le
projet : ce croisement pouvait provoquer une étreinte fatale avec une
souscription concurrente du même investisseur sur le même projet. Ce n'était pas
l'objet du lot, mais y ajouter une écriture sans corriger l'ordre aurait aggravé
un risque existant.

## Décision 4 — Aucun flux d'argent réel ; le versement au porteur est déclaratif

`POST /admin/projets/:id/versement-porteur` **n'exécute aucun virement**. Elle
enregistre qu'un virement a été effectué hors plateforme, avec sa référence
bancaire et sa date, débite le grand livre en conséquence et trace l'opération au
journal d'audit. Le service `ProjectLedgerService` n'a **aucun collaborateur
externe injecté** : ni Stripe, ni client HTTP, ni PSP — l'absence d'appel
externe est une propriété de sa signature, pas une promesse.

Idempotence sur la référence bancaire : clé `versement-porteur:<projetId>:<réf>`
portée par la colonne unique `idempotencyKey`. Un doublon est rejeté en 409.

## Décision 5 — Les frais dus à la clôture sont dérivés de la grille, jamais codés en dur

`ProjectLedgerService.fraisDusSurCollecte(collecte, rates)` consomme
`PlatformFeesService.getRates()`. La grille en vigueur **n'assoit aucun frais sur
la collecte** : les frais d'entrée à la souscription ont été supprimés (voir
`platform-fees.constants.ts`), et les commissions se prélèvent à l'exécution des
distributions, aux sorties et au marché secondaire. La fonction renvoie donc `0`
aujourd'hui.

Ce n'est pas un contournement : c'est le point d'extension unique. Si un taux
assis sur la collecte apparaît un jour dans la grille, il s'applique **là**, et
nulle part ailleurs. Les `fraisRetenus` réellement exposés proviennent du grand
livre (transactions de type `FRAIS` débitant le wallet du projet), parce que
l'état financier doit rapporter ce qui a été prélevé, pas ce qui aurait dû l'être.

## Décision 6 — Pas de port ni d'adaptateur pour les opérations transactionnelles

Le socle du projet impose l'inversion de dépendance. Elle n'a **pas** été
appliquée à `ResolveProjectWalletUseCase`, qui reçoit un `EntityManager` en
paramètre.

Raison : ce use case doit participer à la transaction de l'appelant, dont il
partage les verrous. Un port qui masquerait l'`EntityManager` ne pourrait pas le
faire ; un port dont la signature l'expose ne masque rien et fait fuiter TypeORM
dans la couche applicative. Ce serait une abstraction sans besoin réel de
substitution — précisément ce que le socle proscrit.

La règle est respectée là où elle a du sens : **tout le calcul métier est pur**
(`grand-livre.ts`, `etat-financier-projet.ts`), sans base de données ni réseau,
et testé comme tel. La convention retenue est celle du dépôt, où chaque use case
monétaire pilote son `EntityManager` (`create-investment`, `cancel-investment`,
`refund-collecte`).

## Dette assumée

1. **Aucune réconciliation avec une source externe.** Le registre est désormais
   équilibré **en interne**. Il n'est confronté ni au solde Stripe, ni à aucun
   relevé bancaire. Un écart entre la base et la réalité bancaire reste
   indétectable. C'est le préalable qui manquait, ce n'est pas la réconciliation.
2. **Le versement au porteur reste un geste manuel.** Tant que le prestataire
   cible n'est pas tranché (décision D2), la plateforme ne peut pas verser. Le
   grand livre sait dire *combien* est dû ; il ne le paie pas.
3. **Le délai de rétractation n'est toujours pas suspensif.** Le wallet est
   débité et l'échéancier généré dans la même transaction ; la rétractation est
   un remboursement a posteriori, pas une annulation. Ce lot préserve cette
   mécanique, il ne la corrige pas.
4. **Les données antérieures au grand livre produiront des soldes négatifs.**
   Un remboursement portant sur un investissement souscrit avant ce lot débite un
   wallet projet qui n'a jamais été crédité. Le débit est **quand même inscrit**,
   avec un avertissement au journal : l'écart devient visible dans
   `ecartReconciliation` au lieu de disparaître. Masquer par un plancher à zéro
   aurait supprimé le symptôme, pas l'incohérence.
5. **`WalletType.SPV` reste non instancié.** Le lot matérialise le wallet
   technique de projet ; la question du véhicule (SPV) dépend de la décision D1.

## Conséquences vérifiables

- L'invariant est démontré par test sur les quatre scénarios exigés :
  souscription, ajout de fractions, rétractation, remboursement de collecte
  échouée — assertion `variationTotale(mouvements) === 0` sur des instantanés
  avant/après de **tous** les wallets.
- `walletDestination` n'est plus jamais nul sur une transaction `SOUSCRIPTION`,
  avec test de non-régression explicite.
- Le montant dû au porteur est calculable : `GET /admin/projets/:id/etat-financier`.
- Un écart de grand livre est désormais **observable** (`ecartReconciliation`,
  `coherent`) au lieu d'être invisible.

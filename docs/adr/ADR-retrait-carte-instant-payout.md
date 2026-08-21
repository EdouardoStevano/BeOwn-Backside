# ADR — Retrait par carte et versement instantané (Stripe Instant Payout)

- **Statut** : accepté pour la V1, avec un bloquant produit ouvert (voir § Constat de sonde)
- **Date** : 2026-08-20
- **Périmètre** : Lot 4a — backend `BeOwn-Backside`, module `src/payments`
- **Contexte amont** : le compte Stripe Connect Express de l'investisseur existe déjà
  (E3). Le retrait débitait le wallet puis laissait Stripe verser automatiquement
  vers l'unique destination du compte connecté. L'investisseur ne pouvait ni
  choisir sa destination, ni obtenir un versement instantané.

## Constat de sonde (préalable à toute décision)

Avant d'écrire le code, `scripts/probe-instant-payout.ts` a été exécuté en mode
test sur le compte plateforme réel (`acct_1TSbaG…`, `country=FR`,
`default_currency=eur`). Faits établis, et non supposés :

1. **Le versement instantané en euros fonctionne — vers un IBAN SEPA.**
   L'external account IBAN FR/EUR remonte
   `available_payout_methods: ["standard","instant"]`, et
   `payouts.create({ method: 'instant', destination: 'ba_…' })` a été accepté
   (`status=pending`).
2. **L'attachement d'une carte de débit est refusé.** Les deux tokens de test
   Stripe (`tok_visa_debit`, `tok_mastercard_debit`) échouent à
   `accounts.createExternalAccount` avec le code `instant_payouts_unsupported` :
   « Instant payouts are not available for debit cards issued by a bank in the
   United States. » Ce refus est **antérieur** à toute logique BeOwn.
3. **Impossible de trancher définitivement le cas d'une carte émise en zone euro** :
   les API « raw card data » sont désactivées sur le compte (bonne posture de
   sécurité), et Stripe ne publie pas de token de test pour une carte de débit
   non-US. Le refus observé porte donc explicitement sur les cartes **US**.
4. **Anti-IDOR confirmé côté Stripe** : lire l'external account du compte B
   depuis le compte A renvoie `resource_missing` (« No such external account »).
5. **Suppression de la destination par défaut refusée** par Stripe tant qu'aucune
   autre n'a été désignée par défaut.
6. `balance.retrieve({ expand: ['instant_available'] }, { stripeAccount })`
   renvoie bien la poche instantanée du compte connecté.

**Conséquence produit à arbitrer (hors périmètre de ce lot)** : en zone euro, le
chemin instantané documenté par Stripe passe par l'IBAN SEPA, pas par la carte.
Le libellé « retrait par carte » n'est donc pas garanti réalisable pour des
comptes FR. Le code est néanmoins prêt : il traite la carte comme un type de
destination parmi d'autres, sans hypothèse sur le canal.

## Décision 1 — Coexistence carte instantanée / IBAN standard, sans réécriture

`POST /payments/retrait` accepte deux champs **optionnels** :
`payoutMethodId` et `method` (`instant` | `standard`).

- Aucun des deux fourni ⇒ **parcours strictement inchangé** : le payout est créé
  sans `method` ni `destination`, exactement comme avant, et un refus de payout
  reste « best-effort » (le compte Express verse automatiquement).
- Au moins l'un des deux fourni ⇒ nouveau parcours : la destination est validée
  puis transmise à Stripe.

Le versement instantané et le virement standard ne sont pas deux implémentations
concurrentes mais **une seule chaîne paramétrée par la destination retenue**.
Ajouter un futur canal (virement SEPA instantané dédié, portefeuille tiers) ne
demandera pas de `case` supplémentaire : seul le mapping de la destination change.

**Conséquence assumée** : la coexistence de deux formes de réponse sur
`POST /payments/retrait`. Les échecs **avant** tout débit lèvent un 4xx typé
(`422` / `409`) ; les échecs **après** débit conservent la forme historique
`202 + { success: false, code, message }`, parce que le code appelant existant
en dépend et que ces réponses signalent un mouvement d'argent déjà annulé.

## Décision 2 — Aucun cache local des destinations de retrait

Les cartes et IBAN de l'investisseur ne sont **pas** persistés en base BeOwn.
Chaque lecture interroge Stripe.

Raisons :

- `default_for_currency` et `available_payout_methods` changent côté Stripe sans
  webhook fiable côté BeOwn ; un cache local se désynchroniserait silencieusement
  et pourrait diriger un versement vers une destination périmée ;
- moins de données de paiement stockées = moins de surface PCI et RGPD ;
- aucune migration de schéma n'est requise — ce qui compte particulièrement ici,
  `npm run migration:run` étant cassé sur ce dépôt (le schéma de dev est bâti par
  le `synchronize` du seed).

**Dette assumée** : chaque appel à `GET /payments/connect/payout-methods`,
`GET /payments/connect/instant-balance` et chaque retrait avec destination
explicite ajoute un aller-retour réseau Stripe (~150–400 ms). Aucun cache n'est
introduit tant que la mesure ne le justifie pas ; le jour où il le faudra, il
devra être court (≤ 60 s), par utilisateur, et invalidé à chaque écriture
(`attach`, `detach`, `setDefault`) — cette stratégie est écrite ici pour ne pas
être réinventée.

## Décision 3 — Le 1 % Stripe est absorbé par la plateforme en V1

Stripe facture ~1 % du montant pour un versement instantané. En V1, ce coût est
**absorbé par BeOwn** : aucune refacturation, aucun champ de frais dans la
réponse, aucun affichage de commission au retrait.

Raisons : le montant reçu par l'investisseur reste exactement celui demandé
(pas de surprise au débit), et introduire une refacturation impliquerait un
recalcul de la grille de frais configurables, hors périmètre de ce lot.

**Conséquence assumée** : le coût croît linéairement avec le volume de retraits
instantanés. À instrumenter avant ouverture large — la métrique
`beown_withdrawal_requests_total{method="stripe_connect_instant"}` et
l'histogramme `beown_withdrawal_amount_eur{method="stripe_connect_instant"}`
permettent d'estimer ce coût sans travail supplémentaire.

## Décision 4 — La liste des destinations inclut les IBAN, pas seulement les cartes

`GET /payments/connect/payout-methods` renvoie **tous** les external accounts du
compte connecté, avec un champ additif `type: 'card' | 'bank_account'`.

Raison : la sonde établit qu'aucune carte n'est attachable aujourd'hui pour un
compte FR (§ Constat, point 2). Filtrer sur les cartes livrerait une
fonctionnalité systématiquement vide, alors que l'IBAN du compte connecté est,
lui, **éligible à l'instantané**. Le contrat validé est respecté : tous les
champs annoncés sont présents ; `brand` porte le nom de la banque et
`expMonth`/`expYear` valent `null` pour un IBAN.

`POST /payments/connect/payout-methods` reste **carte uniquement** (token
Stripe.js `tok_…`) : l'ajout d'IBAN se fait par l'onboarding Stripe existant.

## Décision 5 — Le plafond de 9 999 € ne s'applique qu'au versement instantané

Les bornes 10 € – 9 999 € (`AMOUNT_OUT_OF_RANGE`) sont contrôlées **uniquement**
quand `method: 'instant'`.

Raison : 9 999 € est une limite Stripe propre à l'instantané. L'appliquer au DTO
aurait plafonné aussi les retraits standards, cassant un parcours existant qui
n'a pas de plafond applicatif. Le minimum historique de 10 € reste, lui, porté
par le DTO pour tous les retraits.

## Décision 6 — Sécurité : l'identifiant de compte connecté ne vient jamais du client

Toutes les routes résolvent le compte connecté depuis `userId` (JWT), jamais
depuis le corps de la requête. Une destination appartenant à un tiers renvoie
`NO_PAYOUT_METHOD` — Stripe répondant `resource_missing`, l'existence même de
la ressource n'est pas divulguée. Le résolveur n'injecte que `PayoutMethodsReader`
(ISP) : le chemin retrait ne peut structurellement pas modifier les destinations
de l'investisseur.

Le token de carte est verrouillé au format `tok_…` à la frontière : aucun PAN ni
cryptogramme ne peut transiter par l'API BeOwn, et les logs ne portent que des
identifiants Stripe.

## Décision 7 — Un payout refusé vers une destination choisie déclenche un rollback complet

Historiquement, un `payouts.create` en échec était simplement journalisé : les
fonds restaient sur le compte connecté et partaient au versement automatique.
Ce comportement devient **inacceptable** dès lors que l'investisseur a désigné
une destination — l'argent partirait ailleurs que là où il l'a demandé.

Quand `explicit = true`, un refus synchrone du payout enchaîne : reversal du
transfert, **puis** recrédit idempotent du wallet (`recreditRetrait`), puis
réponse `CARD_REJECTED`. Si le reversal échoue, **aucun recrédit** n'est effectué
(les fonds sont encore chez Stripe : recréditer double-créditerait) et les
administrateurs Finance sont alertés — même règle que le webhook `payout.failed`.

## Alternatives écartées

- **Persister les cartes en base** — rejeté : désynchronisation silencieuse,
  surface de données de paiement accrue, migration requise sur un dépôt dont
  `migration:run` est cassé.
- **Un `PayoutStrategy` par canal (instant/standard)** — rejeté : sur-ingénierie.
  Les deux canaux ne diffèrent que par deux champs passés à Stripe ; une
  hiérarchie de stratégies n'apporterait aucun point de substitution réel.
- **Ajouter les routes à `PaymentController`** — rejeté : le contrôleur dépasse
  déjà 1 100 lignes et porte quatre domaines. Un contrôleur dédié respecte SRP.
- **Refacturer le 1 % à l'investisseur** — reporté, faute d'arbitrage produit.

## Suivis ouverts

1. **Bloquant produit** : trancher « retrait par carte » vs « retrait instantané
   SEPA » pour la zone euro, au vu du refus `instant_payouts_unsupported`.
   Vérifier dans le Dashboard Connect → External accounts si les cartes de débit
   peuvent être activées pour une plateforme FR ; sinon, l'intitulé du lot doit
   évoluer.
2. Le compte plateforme de test remonte `charges_enabled=false` et
   `payouts_enabled=false` : à activer avant toute validation de bout en bout.
3. Le parcours réel de tokenisation (Stripe.js côté navigateur → `tok_…` →
   `createExternalAccount`) n'a pas pu être exécuté sans navigateur : à couvrir
   en QA staging (Lot 4b).

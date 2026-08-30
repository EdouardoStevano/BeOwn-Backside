# Checklist de mise en service — BeOwn

**Date** : 2026-08-29
**Auteur** : ingénieur DevOps (lot 12 du chantier « prêt au lancement »)
**Document parent** : [`runbook-lancement.md`](./runbook-lancement.md) — à exécuter **avant** cette checklist.
**Comptes et personas** : [`../testing/environnement-local.md`](../testing/environnement-local.md)

---

## Comment se servir de ce document

C'est une séquence, pas un menu. Les blocs s'exécutent dans l'ordre : chacun suppose que le précédent est passé. Un bloc en échec arrête la séquence — on corrige, puis on **reprend au début du bloc**, pas là où on s'était arrêté.

Trois règles, sans exception :

1. **Une vérification non exécutée est un échec**, pas une inconnue. On n'écrit jamais « devrait fonctionner ».
2. **On note ce qu'on a vu**, pas ce qu'on attendait : le code de réponse, le message affiché, l'horodatage.
3. **Sur un environnement partagé, on ne « teste » pas une commande destructive.** Les commandes de ce document sont toutes en lecture, sauf celles explicitement marquées.

### Où jouer cette checklist

| Passage | Environnement | Clés Stripe | Objectif |
|---|---|---|---|
| 1er | `staging` (`staging.beown.fr`) | test | dérisquer sans conséquence |
| 2e | `production` (`beown.fr`), **avant** toute communication | live | mise en service réelle |
| 3e | `production`, après chaque déploiement de production | live | non-régression, blocs S0, S1, S3, S5 au minimum |

### Contraintes à respecter pendant les tests

Reprises de `../testing/environnement-local.md` :

1. **Limitation de connexion : 10 tentatives / 15 minutes / adresse IP.** Ne bouclez jamais sur l'écran de connexion : au onzième essai, vous vous bloquez vous-même pour un quart d'heure.
2. **Ne validez jamais le KYC de `investisseur4@beown.fr`** : c'est le persona qui sert à éprouver le blocage des actions financières. Une fois validé, il ne sert plus à rien.
3. **`npm run migration:run` est interdit** (voir le runbook, étape 6.1).
4. Un environnement déployé sert un **build** : une correction de code n'y apparaît qu'après reconstruction et redéploiement.

### Personas utilisés

| Persona | Identifiant | Mot de passe | Sert à |
|---|---|---|---|
| Visiteur | — | — | pages publiques, consentement aux traceurs |
| Investisseur KYC validé | `investisseur1@beown.fr` | `Investisseur@2026!` | dépôt, souscription, retrait (portefeuille approvisionné en environnement de test) |
| Investisseur non-KYC | `investisseur4@beown.fr` | `Investisseur@2026!` | blocage des actions financières — **ne pas valider son KYC** |
| Porteur de projet | `porteur1@beown.fr` | `Porteur@2026!` | dépôt et suivi de projet — **persona jamais testé à ce jour** |
| Super administrateur | `admin@beown.fr` | `Admin@BeOwn#2026!Secure` | back-office complet |
| Conformité | `compliance@beown.fr` | `Admin@BeOwn#2026!Secure` | file KYC, réclamations |
| Financier | `financier@beown.fr` | `Admin@BeOwn#2026!Secure` | écrans financiers, sorties |
| Rôles peu couverts | `cio@`, `rcci@`, `relation@`, `cgp@beown.fr` | `Admin@BeOwn#2026!Secure` | **jamais exercés** — à couvrir au moins une fois |

> En production, ces comptes n'existent pas : la base de production ne doit **jamais** être remplie par le seed. Vous jouerez la séquence de production avec vos propres comptes réels, créés par le parcours d'inscription. Prévoyez trois adresses de courriel distinctes, dont une hors de votre domaine.

---

## S0 — Santé technique

**Préalable** : déploiement terminé, `kubectl rollout status` en succès.

| # | Action | Résultat attendu | Si échec |
|---|---|---|---|
| S0.1 | `curl -s -o /dev/null -w "%{http_code}\n" https://api.beown.fr/health/live` | `200` | l'API ne tourne pas : `kubectl get pods -n beown`, puis journaux |
| S0.2 | `curl -s https://api.beown.fr/health/ready` | `200`, corps mentionnant PostgreSQL joignable | 503 = base injoignable. Ne pas ouvrir |
| S0.3 | `kubectl get pods -n beown` | tous `Running`, `READY 1/1`, `RESTARTS` stable | un pod en `CrashLoopBackOff` = variable manquante neuf fois sur dix |
| S0.4 | `kubectl get deployment beown-backend -n beown -o jsonpath='{.spec.template.spec.containers[0].image}'` | image taguée par un **SHA de commit**, pas `latest` | rollback impossible à tracer — redéployer par SHA |
| S0.5 | `curl -s -o /dev/null -w "%{http_code}\n" https://api.beown.fr/metrics` | `401` ou `403` **sans jeton** | un `200` signifie que `METRICS_TOKEN` n'est pas posé : les métriques sont publiques |
| S0.6 | `echo \| openssl s_client -connect api.beown.fr:443 -servername api.beown.fr 2>/dev/null \| openssl x509 -noout -dates` | `notAfter` à plus de 30 jours | planifier le renouvellement immédiatement |
| S0.7 | Répéter S0.6 pour `beown.fr` et `admin.beown.fr` | idem | idem |
| S0.8 | `curl -s -o /dev/null -w "%{http_code}\n" https://api.beown.fr/api/docs` | **404** en production | un `200` expose la documentation de l'API au public : `NODE_ENV` n'est pas `production` |
| S0.9 | Ouvrir `https://www.beown.fr` | redirection vers `https://beown.fr` | sans redirection, toutes les requêtes API seront bloquées par la politique d'origine (voir runbook 8.1) |

---

## S1 — Visiteur public

**Persona** : visiteur, navigateur en navigation privée (aucun cookie préexistant).

| # | Action | Résultat attendu | Si échec |
|---|---|---|---|
| S1.1 | Ouvrir `https://beown.fr` | page d'accueil rendue, aucune zone vide, aucune clé de traduction brute affichée (`landing.hero.title` à l'écran = défaut) | corriger avant ouverture |
| S1.2 | Onglet Réseau ouvert, **avant** toute interaction avec le bandeau de consentement | **aucune** requête vers `googletagmanager.com` | dépôt de traceurs sans base légale : bloquant réglementaire, ne pas ouvrir |
| S1.3 | Refuser les traceurs dans le bandeau | toujours aucune requête vers `googletagmanager.com` après rechargement | idem |
| S1.4 | Accepter les traceurs | la requête vers `googletagmanager.com` apparaît alors, et seulement alors | le consentement n'est pas relié au chargement |
| S1.5 | `https://beown.fr/landing/projects` | liste des projets publiés, ou état vide explicite | un écran blanc n'est pas un état vide |
| S1.6 | `https://beown.fr/landing/statistiques` | page de statistiques publiques, avec la description de ce qui est mesuré | une valeur « 0 % » sans périmètre affiché est une information trompeuse |
| S1.7 | `https://beown.fr/landing/cgu` | conditions générales complètes | un texte « en cours de finalisation » interdit l'ouverture |
| S1.8 | `https://beown.fr/landing/legal` et `/landing/privacy` | mentions légales et politique de confidentialité complètes, cohérentes avec la structure juridique réelle | voir bloc « À la charge du fondateur » |
| S1.9 | `https://beown.fr/landing/risks` | avertissement sur les risques accessible | idem |
| S1.10 | Basculer la langue en anglais, reparcourir S1.1 à S1.9 | aucun texte français résiduel, aucune clé brute | signaler au lot i18n |
| S1.11 | Chercher dans les pages publiques les mentions « fonds cantonnés », « Mobile Money », « tokenisé », « Blockchain », « DICI » | **aucune occurrence** | allégations non étayées par le code — retrait obligatoire avant ouverture (voir bloc final) |

---

## S2 — Inscription et vérification d'adresse

**Persona** : nouvelle adresse de courriel, **hors de votre domaine** (pour éprouver la délivrabilité réelle).

| # | Action | Résultat attendu | Si échec |
|---|---|---|---|
| S2.1 | `https://beown.fr/auth/register`, formulaire complet | compte créé, message de confirmation | un `409` sur une adresse neuve = séquences PostgreSQL désalignées (runbook 6.4) |
| S2.2 | Consulter la boîte de réception | courriel de vérification reçu **en moins de deux minutes**, dans la boîte principale et non en indésirables | SMTP mal configuré ou SPF/DKIM absents (runbook 5.2) |
| S2.3 | Examiner l'en-tête du message reçu | `spf=pass`, `dkim=pass`, expéditeur `no-reply@beown.fr` | corriger les enregistrements DNS avant ouverture |
| S2.4 | Cliquer le lien de vérification | adresse vérifiée, redirection vers la plateforme | un lien vers `localhost` ou un domaine erroné = `FRONTEND_URL` mal renseignée |
| S2.5 | Recliquer le même lien | refus explicite (jeton à usage unique) | un jeton rejouable est une faille |
| S2.6 | Inspecter la page d'inscription | le CAPTCHA se charge et n'accepte pas un envoi vide | une clé de site de démonstration rend le CAPTCHA inopérant (runbook 4.3, constat annexe) |

---

## S3 — Connexion et second facteur

| # | Persona | Action | Résultat attendu | Si échec |
|---|---|---|---|---|
| S3.1 | compte de S2 | connexion avec le bon mot de passe | accès au tableau de bord | — |
| S3.2 | idem | connexion avec un mauvais mot de passe | refus, **sans** indiquer si l'adresse existe | fuite d'information sur les comptes |
| S3.3 | idem | activer la double authentification, enrôler une application d'authentification | code QR affiché, code à six chiffres accepté | `TFA_APP_NAME` absent = échec d'enrôlement (runbook 3.2) |
| S3.4 | idem | se déconnecter, se reconnecter | second facteur demandé, connexion aboutie | — |
| S3.5 | idem | rester connecté plus d'une heure, poursuivre la navigation | session prolongée sans reconnexion | l'arrêt de Redis invalide tous les jetons de rafraîchissement — anomalie connue à surveiller |
| S3.6 | — | tenter cinq connexions erronées d'affilée | blocage progressif, message explicite | **attention** : ne pas dépasser dix essais, sous peine de vous bloquer un quart d'heure |

---

## S4 — Vérification d'identité et blocage des actions financières

| # | Persona | Action | Résultat attendu | Si échec |
|---|---|---|---|---|
| S4.1 | investisseur non vérifié | tenter un dépôt | refus explicite, avec la marche à suivre | un refus muet, ou pire une autorisation, est bloquant |
| S4.2 | idem | tenter d'investir | refus explicite | idem |
| S4.3 | idem | tenter un retrait | refus explicite **avant** toute mention de Stripe | l'utilisateur ne doit pas découvrir le blocage après un formulaire tiers |
| S4.4 | compte de S2 | lancer la vérification d'identité | redirection vers l'interface Stripe Identity | vérifier `STRIPE_SECRET_KEY` |
| S4.5 | idem | terminer la vérification avec une pièce d'identité réelle (en production) ou de test (en staging) | statut « en cours d'instruction » puis « validé » | — |
| S4.6 | — | contrôler la réception du webhook | `kubectl logs deployment/beown-backend -n beown --since=10m \| grep identity.verification_session` | rien = webhook non déclaré ou événements non cochés (runbook 4.4) |
| S4.7 | conformité | ouvrir la file de revue KYC du back-office | le dossier apparaît avec son statut réel | — |

---

## S5 — Dépôt de fonds

| # | Persona | Action | Résultat attendu | Si échec |
|---|---|---|---|---|
| S5.1 | investisseur vérifié | initier un dépôt de 20 € | formulaire de paiement Stripe affiché | — |
| S5.2 | idem | en staging, carte `4242 4242 4242 4242` ; en production, une **vraie carte**, montant minimal | paiement accepté | une clé publique `pk_test` en production fait échouer ici (runbook 4.3) |
| S5.3 | idem | revenir sur le portefeuille | solde crédité **du montant exact**, une seule fois | — |
| S5.4 | — | `kubectl logs ... \| grep "payment_intent.succeeded"` | l'événement est reçu et traité | sans webhook, le solde ne se crédite pas |
| S5.5 | — | Dashboard Stripe → Paiements | le paiement est présent, avec le même montant et la même devise | — |
| S5.6 | idem | rejouer le même paiement depuis le Dashboard (bouton de renvoi de l'événement) | le solde **ne bouge pas** une seconde fois | un double crédit est une anomalie critique — arrêter la séquence |
| S5.7 | idem | tenter un dépôt en devise autre que l'euro, si l'interface le permet | refus, et notification aux administrateurs | — |

---

## S6 — Souscription à un projet

| # | Persona | Action | Résultat attendu | Si échec |
|---|---|---|---|---|
| S6.1 | investisseur vérifié | ouvrir une fiche projet | frais, durée et nature de l'investissement visibles **avant** le bouton d'investir | information incomplète = risque réglementaire |
| S6.2 | idem | investir un montant inférieur au ticket minimum | refus explicite | — |
| S6.3 | idem | investir un montant supérieur au solde | refus explicite | — |
| S6.4 | idem | investir un montant valide | récapitulatif, puis signature | — |
| S6.5 | idem | signer le bulletin | document signé reçu, investissement visible au portefeuille | vérifier que Yousign est sur son environnement de **production** et non son bac à sable |
| S6.6 | — | en base : somme des mouvements de portefeuille de l'opération | **zéro** — ce qui est débité d'un côté est crédité de l'autre | un déséquilibre est une anomalie comptable critique |
| S6.7 | idem | exercer la rétractation dans le délai | remboursement constaté au portefeuille | — |
| S6.8 | — | recompter après rétractation | somme des mouvements toujours nulle | — |

---

## S7 — Retrait

> **Ce bloc n'a jamais été exécuté de bout en bout, sur aucun environnement.** Prévoyez du temps, et jouez-le d'abord en staging.

| # | Persona | Action | Résultat attendu | Si échec |
|---|---|---|---|---|
| S7.1 | investisseur vérifié | ouvrir l'écran de retrait | le **virement standard est sélectionné par défaut** ; l'instantané est une option à choisir | l'inverse expose la plateforme à environ 1 % de frais non refacturés |
| S7.2 | idem | ajouter une destination de versement | redirection vers l'onboarding Stripe Connect | vérifier que Connect est activé sur la plateforme |
| S7.3 | idem | terminer l'onboarding (identité, adresse, IBAN) | retour sur la plateforme **sur une page valide** | anomalie attendue : l'URL de retour par défaut pointe sur `/dashboard/wallet`, route absente du front (runbook 4.5) |
| S7.4 | — | `GET /payments/connect/status` | `payoutsEnabled: true` | tant que c'est `false`, aucun retrait ne partira |
| S7.5 | idem | retrait **standard** de 10 € | opération acceptée, solde décrémenté, statut en cours | — |
| S7.6 | — | `kubectl logs ... \| grep "payout"` puis Dashboard Stripe → Versements | l'événement `payout.paid` arrive et clôt le retrait | sans webhook, le retrait reste indéfiniment « en cours » |
| S7.7 | idem | retrait **instantané** de 5 € | refus : le plancher est de 10 € | — |
| S7.8 | idem | retrait instantané de 10 001 € | refus : le plafond est de 9 999 € | — |
| S7.9 | — | tentative d'ajout d'une **carte de débit** | refus attendu (`instant_payouts_unsupported`) | comportement connu et documenté : ne pas annoncer de « retrait par carte » |
| S7.10 | idem | provoquer un échec de versement (IBAN invalide en staging) | le portefeuille est **recrédité automatiquement** | un échec sans recrédit immobilise les fonds du client : critique |

---

## S8 — Marché secondaire

| # | Persona | Action | Résultat attendu |
|---|---|---|---|
| S8.1 | investisseur détenteur | mettre des parts en vente avant six mois de détention | refus explicite |
| S8.2 | investisseur détenteur éligible | publier une annonce | annonce visible, frais affichés avant validation |
| S8.3 | second investisseur | exprimer un intérêt | le vendeur en est notifié |
| S8.4 | vendeur | accepter l'intérêt | signature déclenchée, transfert des parts après signature |
| S8.5 | vendeur | refuser un autre intérêt | refus enregistré, acheteur informé, aucune part transférée |

---

## S9 — Réclamations

| # | Persona | Action | Résultat attendu |
|---|---|---|---|
| S9.1 | visiteur | consulter la procédure de réclamation depuis les pages publiques | procédure accessible sans compte |
| S9.2 | investisseur | déposer une réclamation depuis `/dashboard/reclamations` | accusé de réception affiché, réclamation visible dans son suivi |
| S9.3 | conformité | ouvrir la réclamation dans le back-office | elle apparaît, avec son horodatage |
| S9.4 | conformité | instruire et répondre | l'investisseur voit la réponse |

---

## S10 — Porteur de projet

> **Persona jamais exercé sur aucun parcours** — c'est le principal trou de couverture identifié le 2026-08-21.

| # | Action | Résultat attendu |
|---|---|---|
| S10.1 | Connexion `porteur1@beown.fr` | accès à son espace |
| S10.2 | Soumettre un projet complet | projet créé en brouillon, aucune erreur silencieuse |
| S10.3 | Vérifier le suivi de collecte | montants cohérents avec la base |
| S10.4 | Déclarer un loyer ou une charge, selon les écrans disponibles | déclaration enregistrée, visible côté administration |
| S10.5 | Tenter d'accéder à un écran d'administration | refus | — |

---

## S11 — Back-office

| # | Persona | Action | Résultat attendu |
|---|---|---|---|
| S11.1 | super administrateur | parcourir toutes les entrées de menu | aucune page vide, aucune erreur de console |
| S11.2 | conformité | file KYC | accès autorisé |
| S11.3 | financier | écrans financiers et sorties | accès autorisé |
| S11.4 | support | tenter d'accéder à un écran financier | **refus** |
| S11.5 | `cio@`, `rcci@`, `relation@`, `cgp@` | se connecter et ouvrir leurs écrans | accès conforme à leur rôle, aucun écran blanc — **quatre rôles jamais testés** |
| S11.6 | financier | déclarer une sortie de projet | confirmation renforcée demandée avant exécution |
| S11.7 | financier | saisir deux fois la même référence de versement | second refus |
| S11.8 | administrateur | consulter le journal d'audit | les actions des tests précédents y figurent, avec leur auteur |

---

## S12 — Courriels transactionnels

À vérifier dans une boîte réelle, hors du domaine `beown.fr`.

| # | Déclencheur | Résultat attendu |
|---|---|---|
| S12.1 | Inscription | courriel de vérification reçu, liens valides |
| S12.2 | Mot de passe oublié | courriel reçu, lien à usage unique |
| S12.3 | Dépôt confirmé | notification reçue |
| S12.4 | Souscription signée | document joint ou lien de téléchargement fonctionnel |
| S12.5 | Retrait exécuté | notification reçue — **et ne contenant aucun IBAN en clair** |
| S12.6 | Lien de désinscription d'un courriel non transactionnel | désinscription effective |

---

## S13 — Observabilité

| # | Action | Résultat attendu | Si échec |
|---|---|---|---|
| S13.1 | Dans Grafana : `up{job="beown-api"}` | `1` | agent de collecte non déployé ou jeton divergent (runbook 9.2) |
| S13.2 | `beown_http_requests_total` | valeurs non nulles, cohérentes avec les tests joués | métriques non collectées |
| S13.3 | Journaux dans Grafana | les journaux applicatifs remontent, **sans adresse de courriel ni IBAN en clair** | le filtrage ne fonctionne pas |
| S13.4 | Dashboard Stripe → Webhooks | 100 % de réussite sur les tentatives récentes | corriger avant ouverture |
| S13.5 | Arrêter volontairement un pod (`kubectl delete pod <nom> -n beown-staging`, **staging uniquement**) | le pod redémarre, le service reste disponible, une alerte de disponibilité se déclenche puis se referme | si aucune alerte n'arrive, la chaîne de notification n'est pas branchée |
| S13.6 | Surveillance externe | notification reçue sur votre téléphone lors du test précédent | brancher un service de surveillance externe (runbook 9.4) |

---

## S14 — Rollback, répété à blanc

**À faire en staging, avant l'ouverture. Ne découvrez pas cette procédure le jour d'un incident.**

| # | Action | Résultat attendu |
|---|---|---|
| S14.1 | `kubectl rollout history deployment/beown-backend -n beown-staging` | l'historique des révisions s'affiche |
| S14.2 | `kubectl rollout undo deployment/beown-backend -n beown-staging` | retour à la révision précédente |
| S14.3 | `kubectl rollout status deployment/beown-backend -n beown-staging --timeout=180s` | `successfully rolled out` |
| S14.4 | Rejouer S0.1 à S0.3 | tout est vert |
| S14.5 | Noter la **durée totale** de S14.2 à S14.4 | c'est votre temps de rétablissement réel |
| S14.6 | Répéter une restauration de sauvegarde (runbook 6.4) dans une base jetable | comptages conformes ; noter la durée |

---

## À la charge du fondateur

Aucun agent, aucun ingénieur ne peut faire ces points à votre place. Ils ne sont pas techniques : ils sont décisionnels, contractuels ou juridiques. Tant qu'ils ne sont pas tranchés, la plateforme peut être techniquement en ligne et rester **inexploitable**.

### F1 — Comptes prestataires à ouvrir et à activer

| Prestataire | Ce qui est attendu de vous | Bloque quoi |
|---|---|---|
| **Stripe — compte plateforme** | activation complète : `charges_enabled` et `payouts_enabled` à `true` (aujourd'hui **`false` tous les deux**) | tout paiement et tout retrait réels |
| **Stripe — validation de l'activité** | une réponse **écrite** de Stripe acceptant votre activité, obtenue avant l'ouverture commerciale | risque de fermeture du compte, avec les fonds des clients dessus |
| **Stripe Connect** | activation du mode Express, et un onboarding mené jusqu'au bout au moins une fois | le retrait, qui n'a jamais tourné |
| **SMTP** | compte d'envoi sur votre domaine, mot de passe d'application, enregistrements SPF/DKIM/DMARC | inscriptions, vérifications d'adresse, toutes les notifications |
| **Yousign** | contrat et clés d'**environnement de production** | valeur juridique des bulletins signés |
| **Cloudinary** | compte et clés | images et documents |
| **Twilio** | compte, ou décision assumée de ne pas envoyer de SMS | codes par SMS |
| **Google reCAPTCHA** | clés de votre domaine (la clé actuelle est une clé de démonstration) | protection de l'inscription |
| **Google / LinkedIn / Meta** | applications OAuth déclarées avec les URL de rappel de production | boutons de connexion sociale |
| **Grafana Cloud, Sentry (région UE)** | comptes et jetons | surveillance et remontée d'erreurs |
| **Registrar DNS** | tous les enregistrements de la liste du runbook 8.1, `www` compris | accès public et certificats |

### F2 — Licence de la police Helvetica Now

**Constat vérifié le 2026-08-29** : le dossier `BeOwn - Frontside/BeOwn/src/assets/helvetica-now-display/` contient **81 fichiers** de fonte commerciale Monotype (`.eot`, `.ttf`, `.woff`, `.woff2`). Ils ne sont **pas suivis par Git** aujourd'hui — `git ls-files` en compte zéro — mais ils ne sont **pas non plus ignorés** : ils apparaissent en `?? src/assets/helvetica-now-display/`. Un simple `git add -A` les enverrait dans le dépôt.

Deux usages distincts sont en jeu, et une licence standard Monotype ne couvre généralement ni l'un ni l'autre :

1. **L'incorporation web** — servir les fichiers de fonte aux navigateurs des visiteurs. Elle se facture habituellement au volume de pages vues.
2. **La redistribution dans un dépôt de code** — même privé, même partagé avec un prestataire.

**À faire avant le premier commit qui inclurait ce dossier** :
- retrouver la licence Monotype acquise, et vérifier explicitement qu'elle couvre l'usage web **et** le stockage en dépôt ;
- à défaut, acquérir la licence correspondante, ou remplacer la police par une alternative libre ;
- dans l'intervalle, ajouter le dossier au fichier `.gitignore` pour empêcher tout envoi accidentel.

Ce n'est pas une formalité : c'est le type de manquement qui se règle par une facture rétroactive.

### F3 — Structure juridique et documents

| # | À faire | Pourquoi |
|---|---|---|
| F3.1 | Constituer la structure et arrêter sa dénomination, son siège et son immatriculation | Stripe, mentions légales et contrats en dépendent |
| F3.2 | Compléter les **mentions légales** avec les informations réelles de la structure | obligation légale, et prérequis à l'activation Stripe |
| F3.3 | Faire relire les **conditions générales d'utilisation par un avocat** avant mise en ligne | la version actuelle a été rédigée sans validation juridique externe |
| F3.4 | Faire relire la **politique de confidentialité** et tenir le registre des traitements | protection des données |
| F3.5 | Vérifier que **rien** dans le produit ne revendique un agrément, une supervision, une garantie ou un cantonnement des fonds | la posture retenue est « aucun statut revendiqué » ; toute mention contraire est une allégation à risque |
| F3.6 | Faire retirer les allégations non étayées repérées dans les textes : « fonds cantonnés », « plus de 20 solutions Mobile Money », « agrégation bancaire », « passerelle certifiée AES-256 » | aucune de ces capacités n'existe dans le code |
| F3.7 | Faire corriger la description de l'API, qui présente la plateforme comme un prestataire de services de financement participatif (`src/main.ts:108`) | même motif que F3.5 — cette description est visible dès que la documentation de l'API est exposée |

### F4 — Arbitrages en attente

Repris du plan d'exécution du chantier. Aucun ne peut être rendu par un agent.

| # | Décision | Ce qu'elle débloque | Urgence |
|---|---|---|---|
| **D1** | Marché cible et régime du véhicule (Union européenne ou UEMOA ; société civile, société de gestion, ou repli obligataire) | tout le registre du discours produit, le choix du prestataire de paiement, la question du cantonnement | **avant toute communication de démarchage** |
| **D2** | Prestataire de paiement cible : établissement de monnaie électronique spécialisé, agrégateur régional, ou suppression du portefeuille interne | cantonnement, fin du double parcours de vérification d'identité, versement réel au porteur | dépend de D1 |
| **D3** | Régime fiscal affiché | fiabilité de tout affichage fiscal, du simulateur au document de déclaration | recommandation : neutraliser les taux chiffrés |
| **D4** | **Activation effective des comptes prestataires** | tout ce document | **bloquant immédiat** — c'est le bloc F1 |
| **D5** | Refonte de la section d'accueil en cours | compilation sans bruit et version anglaise propre | non bloquant |
| **D6** | **Licence de la police Helvetica Now** | le premier commit du chantier | **bloquant avant commit** — c'est le bloc F2 |
| **D7** | Vocabulaire « Brick » et « tokenisé » | cohérence du discours, risque de contrefaçon de marque | à programmer |

### F5 — Points techniques bloquants qui vous appartiennent aussi

Ils ne se règlent pas par une décision, mais par une commande passée au développement. Aucun ne peut être contourné par l'exploitation.

| # | Point | Conséquence si rien n'est fait |
|---|---|---|
| F5.1 | **`migration:run` est cassé et le pipeline l'exécute** (`Jenkinsfile:223` et `:229`) | aucune voie propre de création du schéma en production ; tout déploiement de production finira en échec de pipeline |
| F5.2 | **Clé Stripe publique de test figée dans l'image de production** (`prod.Dockerfile:23`) | tous les paiements échouent en production |
| F5.3 | **Aucune sauvegarde de la base** | la perte du nœud est la perte totale des données |
| F5.4 | **Trois alertes d'intégrité financière sont mortes** — métriques déclarées, jamais renseignées | vous croirez être surveillé sans l'être |
| F5.5 | **Aucune réconciliation registre interne ↔ solde Stripe** | un écart entre ce que la base annonce et l'argent réel ne serait pas détecté |
| F5.6 | **Confirmation manuelle de production désactivée sur l'Admin** (`Jenkinsfile:227`) | déploiement automatique en production sur simple envoi de commit |
| F5.7 | **Le porteur de projet n'est jamais payé par le code** | tout versement au porteur reste manuel et déclaratif |
| F5.8 | **Clé d'API de taux de change en clair dans le dépôt** (`prod.Dockerfile:25`) | secret exposé, à faire tourner |

---

## Feuille de résultats

À remplir à chaque passage. Un bloc n'est « passé » que si **toutes** ses lignes le sont.

| Bloc | Environnement | Date | Opérateur | Verdict | Anomalies relevées |
|---|---|---|---|---|---|
| S0 — Santé technique | | | | | |
| S1 — Visiteur public | | | | | |
| S2 — Inscription | | | | | |
| S3 — Connexion et second facteur | | | | | |
| S4 — Vérification d'identité | | | | | |
| S5 — Dépôt | | | | | |
| S6 — Souscription | | | | | |
| S7 — Retrait | | | | | |
| S8 — Marché secondaire | | | | | |
| S9 — Réclamations | | | | | |
| S10 — Porteur | | | | | |
| S11 — Back-office | | | | | |
| S12 — Courriels | | | | | |
| S13 — Observabilité | | | | | |
| S14 — Rollback à blanc | | | | | |

**Règle d'ouverture** : la plateforme n'ouvre au public que si S0 à S7, S12 et S13 sont passés **en production, en clés live**, et que les blocs F1, F2 et F3 sont soldés.

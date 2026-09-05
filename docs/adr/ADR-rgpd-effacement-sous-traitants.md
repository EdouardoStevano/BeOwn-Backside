# ADR — Propagation de l'effacement RGPD aux sous-traitants

**Date** : 2026-09-05 · **Statut** : accepté · **Décideur** : passe RGPD (résorption des divergences code/barème)

**Barème de référence** : `docs/conformite/2026-09-03-baremes-lot2.md` (dépôt Frontside), sections 1, 2.2 et 2.3.

## Contexte

L'anonymisation d'un compte (`AnonymizeAccountService`) et le cron de purge (`RgpdPurgeService`) traitaient la base BeOwn. Le registre des traitements relevait que rien n'était écrit sur ce qui part — ou ne part pas — chez les sous-traitants qui détiennent les mêmes données : Cloudinary pour les pièces, Stripe pour les paiements, Connect et la vérification d'identité.

L'art. 17.2 RGPD impose au responsable de traitement qui efface des données de prendre des mesures raisonnables pour informer les autres responsables qui les traitent ; l'art. 28.3.g impose au sous-traitant d'effacer ou de restituer les données au terme de la prestation, **sauf obligation légale de conservation**. C'est cette réserve qui sépare les deux cas ci-dessous.

## Décision

### 1. Cloudinary — effacement PROPAGÉ

Chaque fichier dont la ligne `document` est supprimée est détruit chez le fournisseur, via `StockageFichiersPort` (adapté par `CloudStorageService`), après commit et sans jamais lever.

Trois précisions posées par cette passe :

- le port **rend l'issue** de la destruction (`true`/`false`) au lieu de `void`. Le rapport d'anonymisation annonçait « N fichier(s) distant(s) détruit(s) » en comptant les *appels* : un échec réseau était journalisé en avertissement dans le service de stockage et l'accountability (art. 5.2 RGPD) affirmait quand même la destruction. Les échecs sont désormais comptés à part (`fichiersDistantsEnEchec`) et journalisés en `warn` — un effacement incomplet doit se voir ;
- à l'**anonymisation**, la ligne `document` part dans tous les cas : la garder pour réessayer maintiendrait le lien applicatif qu'on cherche précisément à couper. Le fichier orphelin est signalé pour reprise manuelle ;
- à la **purge KYC** (clôture + 5 ans), l'inverse : la ligne n'est supprimée QUE si le fichier l'a été. Le commentaire du code le promettait déjà, le code ne le faisait pas — le compte cessait d'être éligible et le fichier restait chez le sous-traitant sans plus aucune référence. Le compte reste désormais sélectionné au run suivant : la reprise est automatique.

Les pièces KYC d'un compte sous obligations ne partent pas à l'anonymisation : elles sont marquées « conservation légale » (art. L. 561-12 CMF) et détruites par le cron cinq ans après la clôture. Cloudinary n'ayant pas d'accès restreint natif, la restriction est **applicative** — et elle est désormais opposable : `kyc:read_archive`, conformité seule.

### 2. Stripe — AUCUN appel destructif, conservation assumée

Ni `Customer.del`, ni suppression de compte Connect, ni suppression de `VerificationSession`. Ce n'est pas une omission.

Supprimer ces objets effacerait les pièces justificatives des opérations **chez celui qui les a exécutées**. Cela heurterait de front :

- **art. L. 123-22 C. com.** — dix ans pour les documents comptables et pièces justificatives ;
- **art. L. 561-12 CMF** — cinq ans pour les documents relatifs aux opérations, à compter de leur exécution ;
- **art. L. 102 B LPF** — six ans pour les documents soumis au droit de communication de l'administration.

et rendrait ininstruisable toute réclamation, tout contrôle ou tout litige ultérieur — y compris ceux que la personne elle-même engagerait.

Stripe est ici **responsable de traitement pour ses propres obligations** légales et réglementaires (établissement de paiement, LCB-FT, comptabilité), pas seulement sous-traitant de BeOwn. La conservation est couverte par l'exception de l'art. 17.3.b RGPD (traitement nécessaire au respect d'une obligation légale).

Ce qui disparaît, c'est la **résolubilité** : les identifiants directs sont écrasés dans la table utilisateur BeOwn, les références Stripe ne mènent plus à une personne depuis la plateforme.

## À inscrire au registre des traitements

| Sous-traitant | Sort à l'effacement | Base légale | Durée |
|---|---|---|---|
| Cloudinary (stockage de pièces) | Destruction propagée, sauf pièces KYC en archivage légal | Art. 17.1 + 28.3.g RGPD | Immédiate ; pièces KYC : clôture + 5 ans (L. 561-12 CMF) |
| Stripe (paiements, Connect, Identity) | **Conservation** — aucune suppression demandée | Art. 6.1.c + exception art. 17.3.b RGPD | La plus longue des trois obligations : **10 ans** (L. 123-22 C. com.) |

La personne qui exerce son droit à l'effacement doit être informée de cette limite : c'est une information due au titre de l'art. 12.4 RGPD, à porter dans la politique de confidentialité à sa prochaine révision validée — **non appliqué dans cette passe**, le texte publié n'étant pas modifié sans validation.

## Conséquences / dette assumée

- Un fichier resté chez Cloudinary après échec de destruction n'est repris automatiquement que dans le cas de la purge KYC ; à l'anonymisation, il exige une reprise manuelle sur la foi du journal. Une file de reprise serait la sortie de dette propre, non retenue ici : le volume attendu est nul ou marginal, et une file introduirait un état persistant pour un cas qui ne s'est jamais produit.
- Aucune vérification automatique ne confirme que Stripe applique bien ses propres durées : c'est une garantie contractuelle (DPA), pas une garantie technique.

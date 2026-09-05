# ADR — NIF et résidence fiscale : conservés, et enfin utilisés

**Date** : 2026-09-05 · **Statut** : accepté · **Décideur** : passe RGPD (résorption des divergences code/barème)

## Contexte

`profil_personne_physique.nif` et `profil_personne_physique.residenceFiscale` étaient collectés au formulaire de profil, validés, persistés, mappés, exportés dans l'export art. 15/20, effacés à l'anonymisation… et lus par **aucun calcul et aucun document**.

Une donnée collectée sans finalité effective est un manquement à la minimisation (art. 5.1.c RGPD) : ce n'est pas la colonne qui pose problème, c'est l'absence d'usage qui la justifie.

Deux issues possibles : cesser de collecter, ou rendre à la donnée l'usage réglementaire qui la fonde.

## Décision

**Conserver les colonnes, et brancher les deux champs sur le récapitulatif fiscal (IFU).**

Ils figurent désormais au cadre « Bénéficiaire » du PDF produit par `IfuPdfService`, chacun n'étant imprimé que s'il est renseigné.

### Pourquoi cet usage existe réellement

- **Bénéficiaire non-résident** : le pays de résidence fiscale commande le régime applicable (convention bilatérale, taux de retenue), et le NIF étranger est l'identifiant qui permet de le rattacher. C'est exactement le couple que l'échange automatique d'informations impose de tenir pour les comptes déclarables — **art. 1649 AC CGI**, directive 2014/107/UE (DAC2), norme CRS.
- **Déclaration des revenus de capitaux mobiliers** : **art. 242 ter CGI** (formulaire 2561) identifie le bénéficiaire ; le numéro fiscal fiabilise le rapprochement par l'administration.

Le document produit reste un **récapitulatif interne** (il le dit dans ses mentions légales) et non un IFU officiel transmis par voie réglementaire. Cela ne change rien à l'analyse : c'est le document sur lequel le bénéficiaire s'appuie pour déclarer, et un investisseur non-résident sans pays de résidence ni NIF sur son récapitulatif ne peut rien en faire.

### Pourquoi ne pas supprimer les colonnes

Des données existent en base. Les détruire serait irréversible, et l'usage ci-dessus est réel, pas hypothétique — la question n'était pas « faut-il ces données ? » mais « pourquoi ne servaient-elles pas ? ».

### Régime de conservation

Ligne 14 du barème (`docs/conformite/2026-09-03-baremes-lot2.md`, dépôt Frontside) : justificatifs fiscaux, **6 ans**, art. L. 102 B LPF — absorbés en pratique par les dix ans comptables (ligne 6).

Effacement : les deux champs sont écrasés à l'anonymisation d'un compte **sans obligation** (purge totale), et partent avec le dossier d'identité archivé à **clôture + 5 ans** sinon (`purgerDossierKycArchive`). `residenceFiscale` n'était traité par ni l'un ni l'autre avant cette passe — corrigé.

## Constat signalé, hors périmètre de cette passe

Le calcul de l'IFU applique **12,8 % d'IR et 17,2 % de CSG/CRDS à tout le monde**, sans regarder `residenceFiscale`. Or les prélèvements sociaux ne sont en principe pas dus par une personne non affiliée à la sécurité sociale française, et une convention fiscale peut modifier le taux de retenue applicable à un non-résident.

Ce n'est pas une question RGPD mais une question de calcul fiscal, avec un impact sur des montants réellement versés : **signalé, non corrigé ici**. À instruire avec le conseil fiscal avant tout investisseur non-résident.

## Conséquences

- Une donnée de plus figure sur un document remis à la personne — la sienne, sur son propre document : pas d'élargissement de diffusion.
- `FiscaliteModule` importe désormais `ProfilesInfrastructureModule` (aucun cycle : le module profils n'importe rien de la fiscalité).

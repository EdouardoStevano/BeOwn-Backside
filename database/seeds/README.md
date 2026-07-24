# Seed Service Amélioré

## Résumé des améliorations apportées

### 🚀 Performance et Architecture
- **Transaction globale**: Utilisation de transactions TypeORM pour garantir la cohérence des données
- **Batch processing**: Traitement par lots pour optimiser les insertions en base
- **Configuration flexible**: Interface `SeedConfig` pour paramétrer le seed
- **Nettoyage intelligent**: Fonction `cleanDatabase()` avec ordre de suppression respectant les contraintes

### 🛡️ Sécurité et Robustesse
- **Validation des entrées**: Configuration validée avec valeurs par défaut
- **Gestion d'erreurs**: Try-catch avec logs détaillés et rollback transaction
- **Vérification d'état**: Détection automatique si seed déjà effectué
- **Types stricts**: Correction des erreurs TypeScript avec types appropriés

### 📊 Données améliorées
- **Noms réalistes**: Utilisation de noms sénégalais, ivoiriens et maliens authentiques
- **Profils variés**: Génération de profils PP/PM avec données cohérentes
- **Projets diversifiés**: Types de projets résidentiels, commerciaux avec descriptions enrichies
- **Relations logiques**: Liens cohérents entre utilisateurs, projets et investissements

### 🔧 Maintenance et Évolutivité
- **Code modulaire**: Séparation claire des responsabilités en méthodes privées
- **Stockage temporaire**: Variables internes pour éviter les requêtes répétées
- **Utilitaires réutilisables**: Fonctions helpers pour dates, statuts aléatoires
- **Documentation**: Comments détaillés pour chaque section

## Utilisation

### Configuration par défaut
```typescript
await seedService.seed();
```

### Configuration personnalisée
```typescript
await seedService.seed({
  force: true,           // Force le re-création des données
  userCount: 50,         // Nombre d'utilisateurs
  projectCount: 20,      // Nombre de projets
  spvCount: 10,          // Nombre de SPVs
  enableLogging: true,   // Active les logs détaillés
  batchSize: 100,        // Taille des lots pour insertions
});
```

### Forcer le nettoyage complet
```typescript
await seedService.seed({ force: true });
```

## Migration depuis l'ancien seed

1. **Remplacer le fichier**:
   ```bash
   mv seed.service.ts seed.service.old.ts
   mv seed.service.improved.ts seed.service.ts
   ```

2. **Mettre à jour les imports** si nécessaire
3. **Tester avec**:
   ```bash
   npm run schema:drop
   npm run migration:run
   npm run start:dev
   ```

## Structure des données générées

### Utilisateurs (configurable)
- **Staff**: 6 utilisateurs (Admin, Compliance, RCCI, etc.)
- **Investisseurs PP**: Personnes physiques avec profils complets
- **Investisseurs PM**: Personnes morales avec données juridiques
- **Porteurs**: Porteurs de projets pour les différentes régions

### Projets (configurable)
- **Types**: Résidentiel, Tertiaire, Commercial
- **Statuts**: En collecte, financé, terminé
- **Localisation**: Sénégal, Côte d'Ivoire, Mali
- **Documents**: Photos, permis, prospectus par projet

### Données financières
- **Wallets**: Un par utilisateur avec solde initial
- **Investissements**: Distribution aléatoire par projet
- **Marché secondaire**: Ordres d'achat/vente simulés
- **Transactions**: Historique des mouvements

## Performance

- **Temps d'exécution**: ~30-60 secondes pour configuration complète
- **Memory usage**: Optimisé avec traitement par lots
- **Base de données**: Respect des contraintes et indexes

## Dépannage

### Erreurs communes
1. **Contrainte de clé étrangère**: Vérifier l'ordre de nettoyage dans `cleanDatabase()`
2. **Type mismatch**: Corriger les types TypeScript dans les entités
3. **Timeout**: Augmenter `batchSize` ou réduire le volume de données

### Logs de debug
Activer `enableLogging: true` pour voir les étapes détaillées:
- `👥 Création des utilisateurs...`
- `📝 Création des profils et KYC...`
- `🏢 Création des SPVs...`
- `🏗️ Création des projets...`
- `💰 Création des wallets...`
- `📈 Création des investissements...`
- `📊 Création des ordres de marché secondaire...`
- `📄 Création des documents...`
- `🔔 Création des notifications...`

## Extensibilité

Pour ajouter de nouvelles fonctionnalités:

1. **Ajouter des méthodes privées** pour chaque type de données
2. **Mettre à jour `SeedConfig`** pour les nouveaux paramètres
3. **Modifier les données générées** dans les méthodes `generate*Data()`
4. **Ajouter les étapes** dans la méthode `seed()` principale

Le service est conçu pour être facilement extensible tout en maintenant la cohérence et la performance.

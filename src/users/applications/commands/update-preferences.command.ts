import { Command } from '@nestjs/cqrs';
import { UserPreferences } from 'src/users/domains/user-preferences';

/**
 * Mise à jour partielle des préférences. Les endpoints « toggle » du contrôleur
 * (langue, notifications, 2FA…) passent tous par cette commande : un seul
 * chemin d'écriture, donc une seule règle à faire évoluer.
 */
export class UpdatePreferencesCommand extends Command<UserPreferences> {
  constructor(
    public readonly userId: number,
    public readonly changes: Partial<UserPreferences>,
  ) {
    super();
  }
}

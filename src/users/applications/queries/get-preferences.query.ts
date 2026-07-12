import { Query } from '@nestjs/cqrs';
import { UserPreferences } from 'src/users/domains/user-preferences';

export class GetPreferencesQuery extends Query<UserPreferences> {
  constructor(public readonly userId: number) {
    super();
  }
}

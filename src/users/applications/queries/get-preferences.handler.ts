import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import { UserPreferences } from 'src/users/domains/user-preferences';
import { GetPreferencesQuery } from './get-preferences.query';

@QueryHandler(GetPreferencesQuery)
export class GetPreferencesHandler implements IQueryHandler<GetPreferencesQuery> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  execute(query: GetPreferencesQuery): Promise<UserPreferences> {
    return this.userRepository.findPreferences(query.userId);
  }
}

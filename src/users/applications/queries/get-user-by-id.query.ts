import { Query } from '@nestjs/cqrs';

/** Lecture d'un utilisateur : autorisée pour soi-même ou pour un administrateur. */
export class GetUserByIdQuery extends Query<Record<string, unknown>> {
  constructor(
    public readonly requesterId: number,
    public readonly targetUserId: number,
  ) {
    super();
  }
}

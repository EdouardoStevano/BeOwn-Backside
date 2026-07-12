import { Query } from '@nestjs/cqrs';

/** Vue agrégée « mon compte » : identité, profils, KYC, wallet, documents, avancement. */
export class GetMyProfileQuery extends Query<Record<string, unknown>> {
  constructor(public readonly userId: number) {
    super();
  }
}

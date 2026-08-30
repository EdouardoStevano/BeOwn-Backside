import { Injectable } from '@nestjs/common';
import { EvenementIdentiteTranslator } from 'src/compliance/application/acl/evenement-identite.translator';
import { AppliquerUnVerdictUseCase } from './appliquer-un-verdict.usecase';

/**
 * Traitement des événements de vérification d'identité **annoncés** par le
 * fournisseur.
 *
 * Il ne reste ici que ce qui est propre au webhook : reconnaître un événement
 * qui nous concerne, et le traduire. Ce qu'on fait ensuite du verdict —
 * l'accueillir, l'écarter, l'appliquer, annoncer et archiver — appartient à
 * {@link AppliquerUnVerdictUseCase}, parce que la **réconciliation** y aboutit
 * aussi : elle va chercher le verdict quand l'annonce n'arrive pas, et les deux
 * chemins doivent produire exactement les mêmes transitions.
 *
 * Ce use case portait auparavant les deux moitiés — 426 lignes à l'origine, où
 * la machine à états du KYC était noyée sous le parsing JSON, trois tables de
 * transition, deux blocs de notifications et le téléchargement des pièces. Il
 * en reste dix.
 *
 * **La vérification de signature reste chez la trésorerie.** L'endpoint Stripe
 * est partagé entre paiements et vérification d'identité : le contrôleur de
 * paiement authentifie l'événement, puis relaie les `identity.*` ici. Ce
 * contexte ne reçoit que des événements déjà prouvés authentiques, et ne dépend
 * d'aucun module de paiement pour autant — la flèche va de la trésorerie vers
 * la conformité, jamais l'inverse.
 */
@Injectable()
export class HandleIdentityWebhookUseCase {
  constructor(private readonly appliquer: AppliquerUnVerdictUseCase) {}

  /** Vrai si cet événement relève de la vérification d'identité. */
  static concerne(eventType: string): boolean {
    return EvenementIdentiteTranslator.concerne(eventType);
  }

  /**
   * Point d'entrée unique.
   *
   * Un événement illisible est un no-op silencieux : le fournisseur traite une
   * exception comme un échec de livraison et rejoue l'événement, indéfiniment
   * pour une donnée qui ne deviendra jamais valide.
   */
  async handle(event: unknown): Promise<void> {
    const fait = EvenementIdentiteTranslator.traduire(event);
    if (!fait) return;

    await this.appliquer.execute(fait);
  }
}

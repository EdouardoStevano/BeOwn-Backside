import { Logger } from '@nestjs/common';
import { TelephoneDeclareEventHandler } from './telephone-declare.event-handler';
import type { ChangerTelephoneUseCase } from 'src/iam/application/usecases/account/changer-telephone.usecase';
import { ProfilPPCreeDomainEvent } from 'src/compliance/domain/events/profil-pp-cree.domain-event';
import { ProfilPPMisAJourDomainEvent } from 'src/compliance/domain/events/profil-pp-mis-a-jour.domain-event';

const UTILISATEUR = 42;

/**
 * L'abonné ne porte aucune règle d'IAM : il délègue au use case du contexte
 * propriétaire. C'est donc cette délégation qu'on éprouve ici — la façon dont
 * un compte enregistre son numéro est éprouvée chez lui.
 */
function monter() {
  const changerTelephone = { execute: jest.fn().mockResolvedValue(true) };

  return {
    handler: new TelephoneDeclareEventHandler(
      changerTelephone as unknown as ChangerTelephoneUseCase,
    ),
    changerTelephone,
  };
}

const evenement = (telephone?: string) =>
  new ProfilPPCreeDomainEvent(UTILISATEUR, telephone);

describe('TelephoneDeclareEventHandler', () => {
  it('confie au compte le numéro déclaré à la création du profil', async () => {
    const { handler, changerTelephone } = monter();

    await handler.handle(evenement('0033612345678'));

    expect(changerTelephone.execute).toHaveBeenCalledWith(
      UTILISATEUR,
      '0033612345678',
    );
  });

  it('réagit de même à une mise à jour du profil', async () => {
    // Deux faits distincts, une seule réaction : corriger son numéro et le
    // déclarer pour la première fois aboutissent au même endroit.
    const { handler, changerTelephone } = monter();

    await handler.handle(
      new ProfilPPMisAJourDomainEvent(UTILISATEUR, '0612345678'),
    );

    expect(changerTelephone.execute).toHaveBeenCalledWith(
      UTILISATEUR,
      '0612345678',
    );
  });

  it("ne touche pas au compte quand le formulaire n'a rien déclaré", async () => {
    // `undefined` signifie « ne pas toucher », et non « effacer ».
    const { handler, changerTelephone } = monter();

    await handler.handle(evenement(undefined));

    expect(changerTelephone.execute).not.toHaveBeenCalled();
  });

  it('trace un report manqué au lieu de le laisser filer', async () => {
    // Le profil est enregistré et la réponse est partie : un numéro refusé ne
    // peut plus remonter à l'appelant, il doit donc laisser une trace.
    const { handler, changerTelephone } = monter();
    const erreur = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    changerTelephone.execute.mockRejectedValue(new Error('numéro invalide'));

    await expect(handler.handle(evenement('06'))).resolves.toBeUndefined();

    expect(erreur).toHaveBeenCalled();
    erreur.mockRestore();
  });
});

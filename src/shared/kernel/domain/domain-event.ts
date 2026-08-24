/**
 * **Fait métier déjà arrivé** (§12) — le marqueur commun à tous les événements
 * de domaine, quel que soit le Bounded Context qui les publie.
 *
 * Les dix-huit événements du projet implémentaient `IEvent` de `@nestjs/cqrs`.
 * §32 l'interdit sans ambiguïté — « Domain ❌ NestJS » — et §25 nomme
 * précisément `DomainEvent` parmi ce que le Shared Kernel peut contenir. Ce
 * fichier est ce que §41 dessine sous `shared/kernel/domain/`.
 *
 * **Le remplacement est sans risque, et c'est ce qui le rend possible.**
 * `IEvent` est une interface *vide* : `EventBus.publish<T extends IEvent>`
 * accepte donc structurellement tout objet, y compris ceux qui déclarent ce
 * marqueur-ci. Rien ne change à l'exécution ; ce qui change, c'est que le
 * domaine ne nomme plus le framework.
 *
 * Il reste volontairement minuscule. §25 avertit qu'un Shared Kernel ne doit
 * pas devenir un second domaine global : il porte ce que *tous* les contextes
 * partagent — la notion de fait passé — et rien de ce qui appartient à l'un
 * d'eux.
 */
export interface DomainEvent {
  /**
   * Quand le fait s'est produit.
   *
   * Optionnel parce que la moitié des événements existants ne l'exposent pas
   * encore, et qu'un marqueur ne doit pas forcer une migration de dix-huit
   * fichiers pour être adopté. Ceux qui le portent le nomment déjà
   * `occurredAt`.
   */
  readonly occurredAt?: Date;
}

import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/**
 * Booléen STRICT : seuls `true` et `false` JSON sont acceptés.
 *
 * Le `ValidationPipe` global tourne avec `enableImplicitConversion: true`.
 * class-transformer convertit alors toute valeur en booléen AVANT que
 * `@IsBoolean()` ne l'examine — et la conversion est celle de `Boolean(v)` :
 *
 *     { value: "false" } → true
 *     { value: "0" }     → true
 *     { value: "oui" }   → true
 *
 * Sur une bascule d'opt-out, cela se traduit par l'inverse de ce que
 * l'utilisateur demande : un client envoyant la chaîne `"false"` pour couper
 * les e-mails marketing les ACTIVAIT, et recevait 200. Un consentement ne peut
 * pas dépendre du typage JSON d'un client.
 *
 * Le `@Transform` relit la valeur BRUTE dans l'objet source (`obj[key]`), ce
 * qui annule la conversion implicite pour ce champ précis ; `@IsBoolean()`
 * redevient alors un vrai contrôle de type et rend une 400.
 *
 * Portée volontairement limitée au champ décoré : `enableImplicitConversion`
 * reste nécessaire ailleurs (paramètres de requête, nombres) et le désactiver
 * globalement toucherait tous les DTO du projet.
 */
export const IsStrictBoolean = (): PropertyDecorator =>
  applyDecorators(
    Transform(({ obj, key }) => (obj as Record<string, unknown>)[key]),
    IsBoolean(),
  );

import type { ProfilPP } from 'src/compliance/domain/aggregates/profil-pp';
import { PLANCHER_PLAFOND_NON_AVERTI } from 'src/compliance/domain/domain-services/plafond-psfp.domain-service';
import type { EligibilitePsfp } from '../../domain/value-objects/eligibilite-psfp';

/**
 * **Anti-Corruption Layer vers `compliance`** (§13, §20) — le seul endroit du
 * contexte qui lise le profil investisseur du contexte amont.
 *
 * `compliance` est en amont (§3.4) : il décide de la catégorisation PSFP et de
 * la formule du plafond conseillé (`plafondConseille()` sur le profil, adossée
 * à `PLANCHER_PLAFOND_NON_AVERTI`). `subscription` n'en retient que le verdict
 * — {@link EligibilitePsfp} — et ne recalcule jamais la règle : c'est
 * précisément ce que §3.3 reproche aux contextes qui dupliquent un calcul déjà
 * fait ailleurs.
 *
 * Un profil absent n'est pas une erreur ici : l'investisseur n'est alors pas
 * catégorisé non-averti, aucun plafond ne lui est recommandé, et le
 * `KycValidatedGuard` monté devant la route a déjà tranché son droit
 * d'investir. C'est le comportement `?? false` / `?? null` du code d'origine,
 * rendu explicite.
 */
export class EligibilitePsfpTranslator {
  static traduire(profil: ProfilPP | null | undefined): EligibilitePsfp {
    return {
      estNonAverti: profil?.estNonAverti() ?? false,
      plafondConseille: profil?.plafondConseille() ?? null,
      patrimoineDeclare: Number(profil?.patrimoineDeclare ?? 0),
      plancherPlafond: PLANCHER_PLAFOND_NON_AVERTI,
    };
  }
}

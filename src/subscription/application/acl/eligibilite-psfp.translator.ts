import { PLANCHER_PLAFOND_NON_AVERTI } from 'src/compliance/domain/domain-services/plafond-psfp.domain-service';
import type { EligibiliteDuTitulaire } from 'src/compliance/application/ports/profil-conformite.query';
import type { EligibilitePsfp } from '../../domain/value-objects/eligibilite-psfp';

/**
 * **Anti-Corruption Layer vers `compliance`** (§13, §20) — le seul endroit du
 * contexte qui lise le verdict d'éligibilité du contexte amont.
 *
 * `compliance` est en amont (§3.4) : il décide de la catégorisation PSFP et de
 * la formule du plafond conseillé. `subscription` n'en retient que le verdict —
 * {@link EligibilitePsfp} — et ne recalcule jamais la règle : c'est précisément
 * ce que §3.3 reproche aux contextes qui dupliquent un calcul déjà fait
 * ailleurs.
 *
 * **Il lisait l'agrégat `ProfilPP`**, pour y prendre une catégorie et un
 * plafond que ce profil ne calculait pas — il n'en tenait qu'une copie, écrite
 * par le questionnaire. Et comme une personne morale n'a pas de profil PP, elle
 * traversait ce traducteur en `null` : ni catégorie, ni plafond, donc **aucune
 * limite opposée**. Le port de conformité est clé sur le titulaire et sert les
 * deux natures.
 */
export class EligibilitePsfpTranslator {
  static traduire(verdict: EligibiliteDuTitulaire): EligibilitePsfp {
    return {
      estNonAverti: verdict.estNonAverti,
      plafondConseille: verdict.plafondConseille,
      patrimoineDeclare: Number(verdict.patrimoineDeclare ?? 0),
      plancherPlafond: PLANCHER_PLAFOND_NON_AVERTI,
    };
  }
}

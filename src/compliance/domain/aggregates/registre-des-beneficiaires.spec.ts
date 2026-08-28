import { ChampProfilInvalideError } from '../errors';
import {
  BeneficiaireEffectifIntrouvableError,
  DetentionDirecteExcessiveError,
} from '../errors/beneficiaire-effectif.errors';
import { ModeDeDetention } from '../enums/mode-de-detention.enum';
import { BeneficiaireEffectif } from '../entities/beneficiaire-effectif';
import { CodePays } from '../value-objects/code-pays.vo';
import { DateNaissance } from '../value-objects/date-naissance.vo';
import { NomPersonne } from '../value-objects/nom-personne.vo';
import { PourcentageDetention } from '../value-objects/pourcentage-detention.vo';
import { RegistreDesBeneficiaires } from './registre-des-beneficiaires';

const SOCIETE = 'societe-1';
const LE_JOUR = new Date('2026-08-28T10:00:00.000Z');

const DECLARATION = {
  prenom: 'Awa',
  nom: 'Koné',
  pourcentageDetention: 30,
};

/**
 * Un registre tel que le repository le recharge : ses déclarations ont une
 * identité. C'est l'état dans lequel on en retire une — on ne supprime jamais
 * une déclaration qui n'a pas encore été enregistrée.
 */
function registreAvec(
  parts: { pourcentage: number; mode?: ModeDeDetention }[],
): RegistreDesBeneficiaires {
  return new RegistreDesBeneficiaires({
    societeId: SOCIETE,
    beneficiaires: parts.map(
      (part, rang) =>
        new BeneficiaireEffectif({
          id: `beneficiaire-${rang + 1}`,
          prenom: NomPersonne.restore('Awa') as NomPersonne,
          nom: NomPersonne.restore(`Koné-${rang + 1}`) as NomPersonne,
          dateNaissance: DateNaissance.restore('1985-06-15'),
          nationalite: CodePays.restore('FR'),
          pourcentage: PourcentageDetention.restore(part.pourcentage),
          mode: part.mode ?? ModeDeDetention.DIRECTE,
          createdAt: LE_JOUR,
        }),
    ),
  });
}

describe('BeneficiaireEffectif — ce que la déclaration exige', () => {
  const declarer = (champs: Record<string, unknown>) => () =>
    RegistreDesBeneficiaires.vierge(SOCIETE).declarer(champs, LE_JOUR);

  it('refuse une part sous le seuil de 25 %', () => {
    // « Les actionnaires possédant 25 % et plus des parts » : en deçà, la
    // personne n'est pas un bénéficiaire effectif. La règle vivait dans un
    // `@Min(25)` du DTO, donc uniquement sur cette route HTTP.
    expect(
      declarer({ ...DECLARATION, pourcentageDetention: 24.99 }),
    ).toThrow(ChampProfilInvalideError);
  });

  it('refuse une part supérieure au capital', () => {
    expect(declarer({ ...DECLARATION, pourcentageDetention: 101 })).toThrow(
      ChampProfilInvalideError,
    );
  });

  it('exige un prénom et un nom', () => {
    // Sans eux, la déclaration ne désigne personne et ne peut être rapprochée
    // d'aucune pièce d'identité.
    expect(declarer({ ...DECLARATION, prenom: '  ' })).toThrow(
      ChampProfilInvalideError,
    );
    expect(declarer({ ...DECLARATION, nom: null })).toThrow(
      ChampProfilInvalideError,
    );
  });

  it('refuse une nationalité hors ISO 3166', () => {
    // La colonne acceptait n'importe quelle chaîne.
    expect(declarer({ ...DECLARATION, nationalite: 'ZZ' })).toThrow(
      ChampProfilInvalideError,
    );
  });

  it('tient la détention pour directe par défaut', () => {
    // C'est le cas ordinaire : celui qu'on déclare en remplissant un DBE-S1
    // sans schéma de participation.
    const registre = RegistreDesBeneficiaires.vierge(SOCIETE);

    const beneficiaire = registre.declarer(DECLARATION, LE_JOUR);

    expect(beneficiaire.modeDetention).toBe(ModeDeDetention.DIRECTE);
    expect(beneficiaire.estDirecte()).toBe(true);
  });

  it('arrondit la part au centième, comme la colonne', () => {
    // Sans cela, un tiers déclaré ressortirait arrondi de la base et la somme
    // calculée à l'écriture ne serait pas celle relue.
    const registre = RegistreDesBeneficiaires.vierge(SOCIETE);

    const beneficiaire = registre.declarer(
      { ...DECLARATION, pourcentageDetention: 33.3333 },
      LE_JOUR,
    );

    expect(beneficiaire.pourcentageDetention.value).toBe(33.33);
  });
});

describe('RegistreDesBeneficiaires — le capital ne se partage qu’une fois', () => {
  it('refuse une déclaration qui ferait dépasser 100 % en direct', () => {
    // Trois associés à 40 % est arithmétiquement impossible, et un registre qui
    // l'accepte produit un DBE-S1 que le greffe rejettera.
    const registre = registreAvec([{ pourcentage: 40 }, { pourcentage: 40 }]);

    expect(() =>
      registre.declarer({ ...DECLARATION, pourcentageDetention: 40 }, LE_JOUR),
    ).toThrow(DetentionDirecteExcessiveError);
  });

  it('ne persiste pas la déclaration refusée', () => {
    const registre = registreAvec([{ pourcentage: 60 }]);

    expect(() =>
      registre.declarer({ ...DECLARATION, pourcentageDetention: 50 }, LE_JOUR),
    ).toThrow(DetentionDirecteExcessiveError);
    expect(registre.beneficiaires).toHaveLength(1);
    expect(registre.totalDetentionDirecte()).toBe(60);
  });

  it('accepte un total qui atteint exactement 100 %', () => {
    const registre = registreAvec([{ pourcentage: 60 }]);

    registre.declarer({ ...DECLARATION, pourcentageDetention: 40 }, LE_JOUR);

    expect(registre.totalDetentionDirecte()).toBe(100);
  });

  it("n'oppose pas la limite aux détentions indirectes", () => {
    // Une personne contrôlant une holding qui détient 60 % est bénéficiaire à
    // 60 % indirects — part qui recouvre celle de la holding. Les additionner
    // ferait refuser un registre parfaitement régulier.
    const registre = registreAvec([{ pourcentage: 100 }]);

    registre.declarer(
      {
        ...DECLARATION,
        pourcentageDetention: 60,
        modeDetention: ModeDeDetention.INDIRECTE,
      },
      LE_JOUR,
    );

    expect(registre.beneficiaires).toHaveLength(2);
    // Le total ne compte que les directes.
    expect(registre.totalDetentionDirecte()).toBe(100);
  });

  it('rend un total exact malgré l’arithmétique flottante', () => {
    const registre = registreAvec([
      { pourcentage: 33.33 },
      { pourcentage: 33.33 },
      { pourcentage: 33.33 },
    ]);

    expect(registre.totalDetentionDirecte()).toBe(99.99);
  });
});

describe('RegistreDesBeneficiaires — le retrait', () => {
  it('retire la déclaration visée et libère sa part', () => {
    const registre = registreAvec([{ pourcentage: 60 }, { pourcentage: 30 }]);

    registre.retirer('beneficiaire-1');

    expect(registre.beneficiaires).toHaveLength(1);
    expect(registre.totalDetentionDirecte()).toBe(30);
  });

  it("refuse de retirer quelqu'un qui n'est pas de cette société", () => {
    // Le contrôleur s'en protégeait à la main, en glissant `profilPMId` dans le
    // critère de suppression — une garde qu'il suffisait d'oublier une fois.
    const registre = registreAvec([{ pourcentage: 60 }]);

    expect(() => registre.retirer('beneficiaire-dailleurs')).toThrow(
      BeneficiaireEffectifIntrouvableError,
    );
    expect(registre.beneficiaires).toHaveLength(1);
  });

  it("refuse de retirer une déclaration qui n'a pas encore été enregistrée", () => {
    // Son identité est attribuée par la persistance ; chercher par un
    // identifiant vide ferait correspondre la première d'entre elles.
    const registre = RegistreDesBeneficiaires.vierge(SOCIETE);
    const nouvelle = registre.declarer(DECLARATION, LE_JOUR);

    expect(nouvelle.id).toBeUndefined();
    expect(() => registre.retirer(nouvelle.id)).toThrow(
      BeneficiaireEffectifIntrouvableError,
    );
  });
});

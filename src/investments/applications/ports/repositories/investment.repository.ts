import { Investment } from 'src/investments/domains/investment';
import { Echeance } from 'src/investments/domains/echeance';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';

export const INVESTMENT_REPOSITORY = Symbol('INVESTMENT_REPOSITORY');

/**
 * Agrégats d'un projet, calculés en base et non en mémoire : les deux seuls
 * chiffres que les vues « liste » et « détail » tiraient jusqu'ici du
 * chargement INTÉGRAL des lignes d'investissement.
 */
export interface AgregatInvestissementsProjet {
  /** Σ des montants engagés sur les statuts demandés. */
  montantCollecte: number;
  /** Nombre d'investisseurs DISTINCTS : une personne, une voix. */
  nbInvestisseurs: number;
}

export interface InvestmentRepository {
  saveInvestment(investment: Investment): Promise<Investment>;
  findInvestmentById(id: string): Promise<Investment | null>;
  findByUserId(userId: number): Promise<Investment[]>;
  findByProjetId(projetId: string): Promise<Investment[]>;
  countFractionsVendues(projetId: string): Promise<number>;
  countFractionsVenduesBatch(projetIds: string[]): Promise<Record<string, number>>;

  /**
   * Montant collecté et nombre d'investisseurs distincts, pour PLUSIEURS
   * projets, en UNE requête (GROUP BY projetId).
   *
   * Remplace le `ids.map(id => findByProjetId(id))` du read-model projet : une
   * requête SQL par projet, chacune joignant le projet ENTIER (blob `fici`
   * d'environ 2,4 Ko, `descriptionMd`, `previsionnel`) sur CHAQUE ligne
   * d'investissement, pour n'en tirer qu'une somme et un compte de doublons.
   *
   * `statuts` est passé par l'appelant et non codé ici : la définition des
   * « statuts actifs » est une règle métier, elle vit dans la couche
   * application (ProjectReadModelService) qui garantit que la liste et le
   * détail comptent la même chose. Le dépôt ne fait que l'appliquer.
   *
   * Un projet sans aucune ligne éligible est ABSENT du résultat (pas de clé à
   * zéro) : c'est à l'appelant de choisir sa valeur par défaut.
   */
  agregerParProjet(
    projetIds: string[],
    statuts: InvestmentStatus[],
  ): Promise<Record<string, AgregatInvestissementsProjet>>;

  /**
   * Vrai si cet utilisateur détient encore des parts émises par une société
   * support donnée, tous projets confondus.
   *
   * Sert au sens inverse de la décision D5 : on ne devient pas porteur d'un
   * projet dont on détient déjà des parts. Le périmètre est la SOCIÉTÉ SUPPORT
   * et non le projet, parce que c'est elle qui émet les parts — deux projets
   * adossés à la même SCI mettent leur porteur et leurs associés autour de la
   * même table.
   *
   * Les positions RETRACTE et ANNULE sont exclues : elles ne confèrent plus
   * aucun droit, exactement comme dans `countFractionsVendues`.
   */
  existeDetentionSurSocieteSupport(
    utilisateurId: number,
    spvId: string,
  ): Promise<boolean>;
  updateInvestmentStatus(
    id: string,
    status: InvestmentStatus,
  ): Promise<Investment>;

  updateBulletinDocId(investmentId: string, bulletinDocId: string): Promise<void>;
  updateTopUp(id: string, nbTitresTotal: number, montantTotal: number): Promise<Investment>;

  saveEcheances(echeances: Echeance[]): Promise<Echeance[]>;
  deleteEcheancesByInvestissementId(investissementId: string): Promise<void>;
  findEcheancesByInvestissement(investissementId: string): Promise<Echeance[]>;
}

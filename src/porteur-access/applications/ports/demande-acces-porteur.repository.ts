import {
  DemandeAccesPorteur,
  StatutDemandeAccesPorteur,
} from 'src/porteur-access/domains/demande-acces-porteur';

/**
 * Dépôt des demandes d'accès porteur — deux ports SÉPARÉS (ISP).
 *
 * La lecture et l'écriture sont deux contrats distincts parce qu'ils n'ont pas
 * les mêmes appelants : la consultation (« mes demandes », file du
 * back-office) n'a AUCUNE raison de pouvoir écrire, et le fait qu'elle ne le
 * puisse pas est vérifiable à la compilation, pas seulement à la relecture.
 *
 * `abstract class` et non `interface` : elle sert à la fois d'abstraction et
 * de jeton d'injection NestJS, sans symbole séparé à maintenir (DIP).
 */

/** Filtre de la file de traitement du back-office. */
export interface FiltreDemandesAccesPorteur {
  statut?: StatutDemandeAccesPorteur;
  page?: number;
  limit?: number;
}

/** Page de résultats — même forme que le journal d'audit du back-office. */
export interface PageDemandesAccesPorteur {
  items: DemandeAccesPorteur[];
  total: number;
  page: number;
  limit: number;
}

export abstract class DemandeAccesPorteurReader {
  abstract findById(id: string): Promise<DemandeAccesPorteur | null>;

  /**
   * La demande NON TERMINALE du compte, s'il en a une. C'est elle qui interdit
   * une seconde soumission (409) ; l'index unique partiel en base garantit
   * qu'il ne peut jamais y en avoir deux, y compris sous concurrence.
   */
  abstract findEnCours(
    utilisateurId: number,
  ): Promise<DemandeAccesPorteur | null>;

  /**
   * La dernière demande DÉCIDÉE du compte — sert au délai de carence après
   * refus. Séparée de l'historique complet : le use case de soumission n'a
   * besoin que de celle-là, pas de charger toute la liste.
   */
  abstract findDerniereDecidee(
    utilisateurId: number,
  ): Promise<DemandeAccesPorteur | null>;

  /** Historique du compte, de la plus récente à la plus ancienne. */
  abstract historique(utilisateurId: number): Promise<DemandeAccesPorteur[]>;

  /**
   * File de traitement paginée du back-office.
   *
   * EXCLUT les demandes des comptes CLOS ou SUPPRIMÉS — règle du contrat, pas
   * option d'appel : instruire le dossier d'un compte qui n'existe plus n'a
   * aucun sens, et ces dossiers fantômes vieillissaient dans la file jusqu'à
   * déclencher l'alerte J+25. Toute implémentation doit l'honorer.
   */
  abstract lister(
    filtre: FiltreDemandesAccesPorteur,
  ): Promise<PageDemandesAccesPorteur>;
}

export abstract class DemandeAccesPorteurWriter {
  /** Insère une demande neuve et rend l'exemplaire portant son identifiant. */
  abstract creer(demande: DemandeAccesPorteur): Promise<DemandeAccesPorteur>;

  /** Persiste une transition sur une demande existante. */
  abstract enregistrer(
    demande: DemandeAccesPorteur,
  ): Promise<DemandeAccesPorteur>;
}

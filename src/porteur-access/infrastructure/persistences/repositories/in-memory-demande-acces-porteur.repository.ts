import { randomUUID } from 'crypto';
import { UserStatus } from 'src/iam/domains/enums/user.enum';
import {
  DemandeAccesPorteurReader,
  DemandeAccesPorteurWriter,
  type FiltreDemandesAccesPorteur,
  type PageDemandesAccesPorteur,
} from 'src/porteur-access/applications/ports/demande-acces-porteur.repository';
import {
  DemandeAccesPorteur,
  STATUTS_NON_TERMINAUX,
  type EtatDemandeAccesPorteur,
} from 'src/porteur-access/domains/demande-acces-porteur';
import { DemandeAccesPorteurEnCoursError } from 'src/porteur-access/domains/errors/porteur-access.errors';

const LIMITE_PAR_DEFAUT = 25;
const LIMITE_MAX = 100;

/**
 * Implémentation en mémoire des deux ports du dépôt de demandes.
 *
 * Elle existe pour que le domaine et l'application s'éprouvent SANS base ni
 * réseau, et pas comme une commodité : si un use case ne pouvait pas tourner
 * sur celle-ci, c'est l'architecture qui serait fautive. Elle honore le même
 * contrat que l'adaptateur PostgreSQL — y compris l'invariant « une seule
 * demande non terminale par compte », qui lève ici la MÊME erreur de domaine
 * que la violation de l'index unique partiel côté base (§LSP : une
 * implémentation de substitution respecte le contrat, elle ne l'assouplit pas).
 */
export class InMemoryDemandeAccesPorteurRepository
  implements DemandeAccesPorteurReader, DemandeAccesPorteurWriter
{
  /** Copies d'état : rien ne sort par référence, comme avec une vraie base. */
  private readonly lignes: EtatDemandeAccesPorteur[] = [];

  /**
   * Statut des comptes demandeurs — équivalent en mémoire de la lecture de
   * `users.status` de l'adaptateur PostgreSQL. Sans cet état, `lister` ne
   * pourrait honorer ni la clause « la file n'affiche pas les demandes des
   * comptes disparus », ni la remontée du statut sur chaque ligne : les deux
   * implémentations divergeraient.
   *
   * Un compte absent de la table vaut `null` — exactement ce que rend
   * l'adaptateur réel quand la ligne `users` n'existe pas (référence sans FK
   * dure).
   */
  constructor(
    private readonly statutsComptes: Map<number, UserStatus> = new Map(),
  ) {}

  /** Fixture : marque un compte comme supprimé (donc hors file). */
  marquerCompteClos(utilisateurId: number): void {
    this.statutsComptes.set(utilisateurId, UserStatus.SUPPRIME);
  }

  /** Fixture : pose un statut quelconque sur un compte demandeur. */
  definirStatutCompte(utilisateurId: number, statut: UserStatus): void {
    this.statutsComptes.set(utilisateurId, statut);
  }

  findById(id: string): Promise<DemandeAccesPorteur | null> {
    const ligne = this.lignes.find((l) => l.id === id);
    return Promise.resolve(ligne ? this.hydrater(ligne) : null);
  }

  findEnCours(utilisateurId: number): Promise<DemandeAccesPorteur | null> {
    const ligne = this.lignes.find(
      (l) =>
        l.utilisateurId === utilisateurId &&
        STATUTS_NON_TERMINAUX.includes(l.statut),
    );
    return Promise.resolve(ligne ? this.hydrater(ligne) : null);
  }

  findDerniereDecidee(
    utilisateurId: number,
  ): Promise<DemandeAccesPorteur | null> {
    const ligne = this.lignes
      .filter((l) => l.utilisateurId === utilisateurId && l.decideeLe !== null)
      .sort(
        (a, b) =>
          (b.decideeLe as Date).getTime() - (a.decideeLe as Date).getTime(),
      )[0];
    return Promise.resolve(ligne ? this.hydrater(ligne) : null);
  }

  historique(utilisateurId: number): Promise<DemandeAccesPorteur[]> {
    return Promise.resolve(
      this.lignes
        .filter((l) => l.utilisateurId === utilisateurId)
        .sort((a, b) => b.soumiseLe.getTime() - a.soumiseLe.getTime())
        .map((l) => this.hydrater(l)),
    );
  }

  lister(
    filtre: FiltreDemandesAccesPorteur,
  ): Promise<PageDemandesAccesPorteur> {
    const page = Math.max(1, Number(filtre.page) || 1);
    const limit = Math.min(
      LIMITE_MAX,
      Math.max(1, Number(filtre.limit) || LIMITE_PAR_DEFAUT),
    );
    const filtrees = this.lignes
      .filter((l) => !this.compteDisparu(l.utilisateurId))
      .filter((l) => (filtre.statut ? l.statut === filtre.statut : true))
      .sort((a, b) => b.soumiseLe.getTime() - a.soumiseLe.getTime());

    return Promise.resolve({
      items: filtrees.slice((page - 1) * limit, page * limit).map((l) => ({
        demande: this.hydrater(l),
        statutCompte: this.statutsComptes.get(l.utilisateurId) ?? null,
      })),
      total: filtrees.length,
      page,
      limit,
    });
  }

  /** Comptes clos ou supprimés — exclus de la file (contrat du port). */
  private compteDisparu(utilisateurId: number): boolean {
    const statut = this.statutsComptes.get(utilisateurId);
    return statut === UserStatus.CLOS || statut === UserStatus.SUPPRIME;
  }

  creer(demande: DemandeAccesPorteur): Promise<DemandeAccesPorteur> {
    const etat = demande.snapshot();
    // Réplique de l'index unique partiel : le doublon est refusé PAR LE DÉPÔT,
    // pas par la bonne volonté de l'appelant.
    const doublon = this.lignes.some(
      (l) =>
        l.utilisateurId === etat.utilisateurId &&
        STATUTS_NON_TERMINAUX.includes(l.statut),
    );
    if (doublon) throw new DemandeAccesPorteurEnCoursError();

    const ligne: EtatDemandeAccesPorteur = {
      ...etat,
      id: etat.id ?? randomUUID(),
    };
    this.lignes.push(ligne);
    return Promise.resolve(this.hydrater(ligne));
  }

  enregistrer(demande: DemandeAccesPorteur): Promise<DemandeAccesPorteur> {
    const etat = demande.snapshot();
    const index = this.lignes.findIndex((l) => l.id === etat.id);
    if (index === -1) throw new Error(`Demande inconnue : ${etat.id}`);
    this.lignes[index] = { ...etat, id: etat.id as string };
    return Promise.resolve(this.hydrater(this.lignes[index]));
  }

  private hydrater(ligne: EtatDemandeAccesPorteur): DemandeAccesPorteur {
    return DemandeAccesPorteur.restaurer({ ...ligne });
  }
}

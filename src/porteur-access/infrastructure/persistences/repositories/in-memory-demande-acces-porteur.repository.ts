import { randomUUID } from 'crypto';
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
   * Comptes clos ou supprimés — équivalent en mémoire de la sous-requête sur
   * `users.status` de l'adaptateur PostgreSQL. Sans cet état, `lister` ne
   * pourrait pas honorer la clause « la file n'affiche pas les demandes des
   * comptes disparus » et les deux implémentations divergeraient.
   */
  constructor(private readonly comptesClos: Set<number> = new Set()) {}

  /** Fixture : marque un compte comme clos/supprimé. */
  marquerCompteClos(utilisateurId: number): void {
    this.comptesClos.add(utilisateurId);
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
      .filter((l) => !this.comptesClos.has(l.utilisateurId))
      .filter((l) => (filtre.statut ? l.statut === filtre.statut : true))
      .sort((a, b) => b.soumiseLe.getTime() - a.soumiseLe.getTime());

    return Promise.resolve({
      items: filtrees
        .slice((page - 1) * limit, page * limit)
        .map((l) => this.hydrater(l)),
      total: filtrees.length,
      page,
      limit,
    });
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

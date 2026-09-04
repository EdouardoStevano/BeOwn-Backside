import {
  DemandeAccesPorteurReader,
  DemandeAccesPorteurWriter,
} from 'src/porteur-access/applications/ports/demande-acces-porteur.repository';
import {
  DemandeAccesPorteur,
  StatutDemandeAccesPorteur,
} from 'src/porteur-access/domains/demande-acces-porteur';
import { MotifRefusAccesPorteur } from 'src/porteur-access/domains/motif-refus';
import { DemandeAccesPorteurEnCoursError } from 'src/porteur-access/domains/errors/porteur-access.errors';
import { InMemoryDemandeAccesPorteurRepository } from './in-memory-demande-acces-porteur.repository';

/**
 * Suite de CONTRAT des deux ports du dépôt de demandes.
 *
 * Écrite une fois, exécutable contre n'importe quelle implémentation : c'est
 * ce qui donne un sens vérifiable au principe de substitution (§LSP). Une
 * implémentation qui « oublierait » de refuser un doublon, ou qui trierait
 * l'historique à l'envers, échouerait ici — pas trois mois plus tard en
 * production.
 *
 * LIMITE ASSUMÉE, à dire clairement : elle n'est aujourd'hui jouée QUE contre
 * l'implémentation en mémoire. Le dépôt ne dispose d'AUCUN harnais de base
 * jetable (ni testcontainers, ni base de test) — vérifié au moment d'écrire ce
 * fichier : aucune spec du projet n'ouvre de connexion. Brancher
 * `TypeOrmDemandeAccesPorteurRepository` sur cette même suite est la première
 * chose à faire le jour où un tel harnais existe : `executerContratDepot` est
 * exporté pour ça, et n'attend qu'une fabrique.
 */

const USER_A = 42;
const USER_B = 43;
const ADMIN = 7;
const MOTIVATION = 'x'.repeat(40);

const nouvelle = (utilisateurId: number, soumiseLe = new Date()) =>
  DemandeAccesPorteur.soumettre({
    utilisateurId,
    motivation: MOTIVATION,
    maintenant: soumiseLe,
  });

export function executerContratDepot(
  nom: string,
  fabrique: () => DemandeAccesPorteurReader & DemandeAccesPorteurWriter,
): void {
  describe(`Contrat du dépôt de demandes — ${nom}`, () => {
    let depot: DemandeAccesPorteurReader & DemandeAccesPorteurWriter;
    beforeEach(() => {
      depot = fabrique();
    });

    it('creer attribue un identifiant et rend la demande relisible', async () => {
      const creee = await depot.creer(nouvelle(USER_A));
      expect(creee.id).toEqual(expect.any(String));
      const relue = await depot.findById(creee.id as string);
      expect(relue?.utilisateurId).toBe(USER_A);
      expect(relue?.statut).toBe(StatutDemandeAccesPorteur.SOUMISE);
      expect(relue?.motivation).toBe(MOTIVATION);
    });

    it('findById rend null sur un identifiant inconnu', async () => {
      await expect(depot.findById('inconnu')).resolves.toBeNull();
    });

    it('REFUSE une seconde demande non terminale pour le même compte', async () => {
      await depot.creer(nouvelle(USER_A));
      await expect(
        Promise.resolve().then(() => depot.creer(nouvelle(USER_A))),
      ).rejects.toBeInstanceOf(DemandeAccesPorteurEnCoursError);
    });

    it('mais laisse un AUTRE compte déposer la sienne', async () => {
      await depot.creer(nouvelle(USER_A));
      await expect(depot.creer(nouvelle(USER_B))).resolves.toBeDefined();
    });

    it('rouvre le droit de déposer une fois la précédente close', async () => {
      const premiere = await depot.creer(nouvelle(USER_A));
      premiere.retirer(USER_A);
      await depot.enregistrer(premiere);
      await expect(depot.creer(nouvelle(USER_A))).resolves.toBeDefined();
    });

    it('findEnCours ne voit que les statuts non terminaux', async () => {
      const demande = await depot.creer(nouvelle(USER_A));
      await expect(depot.findEnCours(USER_A)).resolves.not.toBeNull();

      demande.prendreEnExamen(ADMIN);
      await depot.enregistrer(demande);
      await expect(depot.findEnCours(USER_A)).resolves.not.toBeNull();

      demande.accepter(ADMIN);
      await depot.enregistrer(demande);
      await expect(depot.findEnCours(USER_A)).resolves.toBeNull();
    });

    it('enregistrer persiste la transition, sans dupliquer la ligne', async () => {
      const demande = await depot.creer(nouvelle(USER_A));
      demande.refuser(ADMIN, MotifRefusAccesPorteur.DOSSIER_INCOMPLET, 'note');
      await depot.enregistrer(demande);

      const relue = await depot.findById(demande.id as string);
      expect(relue?.statut).toBe(StatutDemandeAccesPorteur.REFUSEE);
      expect(relue?.motifRefus).toBe(MotifRefusAccesPorteur.DOSSIER_INCOMPLET);
      expect(relue?.decideurAdminId).toBe(ADMIN);
      const page = await depot.lister({});
      expect(page.total).toBe(1);
    });

    it('findDerniereDecidee rend la PLUS RÉCENTE des décisions', async () => {
      const t = (jours: number) =>
        new Date(Date.UTC(2026, 0, 1) + jours * 86_400_000);

      const premiere = await depot.creer(nouvelle(USER_A, t(0)));
      premiere.refuser(ADMIN, MotifRefusAccesPorteur.HORS_CRITERES, null, t(1));
      await depot.enregistrer(premiere);

      const seconde = await depot.creer(nouvelle(USER_A, t(60)));
      seconde.refuser(
        ADMIN,
        MotifRefusAccesPorteur.IDENTITE_NON_VERIFIEE,
        null,
        t(61),
      );
      await depot.enregistrer(seconde);

      const derniere = await depot.findDerniereDecidee(USER_A);
      expect(derniere?.motifRefus).toBe(
        MotifRefusAccesPorteur.IDENTITE_NON_VERIFIEE,
      );
    });

    it('findDerniereDecidee ignore les demandes encore ouvertes', async () => {
      await depot.creer(nouvelle(USER_A));
      await expect(depot.findDerniereDecidee(USER_A)).resolves.toBeNull();
    });

    it('historique : du plus récent au plus ancien, et borné au compte', async () => {
      const t = (jours: number) =>
        new Date(Date.UTC(2026, 0, 1) + jours * 86_400_000);

      const ancienne = await depot.creer(nouvelle(USER_A, t(0)));
      ancienne.retirer(USER_A, t(1));
      await depot.enregistrer(ancienne);
      await depot.creer(nouvelle(USER_A, t(30)));
      await depot.creer(nouvelle(USER_B, t(15)));

      const historique = await depot.historique(USER_A);
      expect(historique).toHaveLength(2);
      expect(historique[0].soumiseLe).toEqual(t(30));
      expect(historique.every((d) => d.utilisateurId === USER_A)).toBe(true);
    });

    it('lister filtre par statut et pagine', async () => {
      const t = (jours: number) =>
        new Date(Date.UTC(2026, 0, 1) + jours * 86_400_000);
      for (const [i, userId] of [10, 11, 12, 13].entries()) {
        await depot.creer(nouvelle(userId, t(i)));
      }
      const close = await depot.creer(nouvelle(20, t(9)));
      close.accepter(ADMIN);
      await depot.enregistrer(close);

      const soumises = await depot.lister({
        statut: StatutDemandeAccesPorteur.SOUMISE,
      });
      expect(soumises.total).toBe(4);
      expect(
        soumises.items.every(
          (d) => d.statut === StatutDemandeAccesPorteur.SOUMISE,
        ),
      ).toBe(true);

      const page1 = await depot.lister({ limit: 2, page: 1 });
      const page2 = await depot.lister({ limit: 2, page: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page2.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      // Aucun chevauchement entre deux pages consécutives.
      const ids = [...page1.items, ...page2.items].map((d) => d.id);
      expect(new Set(ids).size).toBe(4);
      // Tri décroissant sur la date de soumission.
      expect(page1.items[0].soumiseLe.getTime()).toBeGreaterThanOrEqual(
        page1.items[1].soumiseLe.getTime(),
      );
    });

    it('lister borne la taille de page (aucune requête non paginée)', async () => {
      const enorme = await depot.lister({ limit: 10_000 });
      expect(enorme.limit).toBeLessThanOrEqual(100);
      const absurde = await depot.lister({
        limit: -5,
        page: Number.NaN,
      });
      expect(absurde.limit).toBeGreaterThan(0);
      expect(absurde.page).toBe(1);
    });

    it("le dépôt rend des COPIES : muter le résultat n'altère rien", async () => {
      const creee = await depot.creer(nouvelle(USER_A));
      creee.accepter(ADMIN);
      // Non enregistrée : la ligne du dépôt n'a pas bougé.
      const relue = await depot.findById(creee.id as string);
      expect(relue?.statut).toBe(StatutDemandeAccesPorteur.SOUMISE);
    });
  });
}

executerContratDepot(
  'implémentation en mémoire',
  () => new InMemoryDemandeAccesPorteurRepository(),
);

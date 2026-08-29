import type { EventBus } from '@nestjs/cqrs';
import { DossierDePieces } from 'src/compliance/domain/aggregates/dossier-de-pieces';
import {
  exigeUnVerso,
  PIECES_EXIGEES_DE_LA_SOCIETE,
  PIECES_EXIGEES_DU_BENEFICIAIRE,
  TypePieceJustificative,
} from 'src/compliance/domain/enums/type-piece-justificative.enum';
import { FichierDepose } from 'src/compliance/domain/value-objects/fichier-depose.vo';
import { TypePieceIdentite } from 'src/compliance/domain/enums/type-piece-identite.enum';
import { DossierDePiecesCompleteDomainEvent } from 'src/compliance/domain/events/dossier-de-pieces-complete.domain-event';
import { DossierDePiecesIncompletDomainEvent } from 'src/compliance/domain/events/dossier-de-pieces-incomplet.domain-event';
import { annoncerLaCompletude } from './annoncer-la-completude';

const LE_JOUR = new Date('2026-08-28T10:00:00.000Z');
const BENEFICIAIRE = 'beneficiaire-1';
const SOCIETE = { id: 's-1', utilisateurId: 42 };

/**
 * La nature du document, pour les seules pièces d'identité.
 *
 * La carte d'identité sert de cas nominal — recto-verso, comme trois documents
 * sur quatre. Le passeport, qui est l'exception, a ses tests dédiés.
 */
function natureDe(type: TypePieceJustificative): TypePieceIdentite | null {
  return type === TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE
    ? TypePieceIdentite.CARTE_IDENTITE
    : null;
}

const fichier = () =>
  FichierDepose.depose({
    nomOrigine: 'piece.pdf',
    cleStockage: 'conformite/societes/s-1/piece',
    url: 'https://exemple/piece.pdf',
    mimeType: 'application/pdf',
    tailleOctets: 4_000,
  });

/**
 * Un dossier dont toutes les pièces exigées sont déposées et acceptées.
 *
 * Deux familles : trois documents pour l'entreprise, deux **par personne** qui
 * la contrôle — le DBE-S1 et la pièce d'identité sont nominatifs.
 */
function dossierComplet(beneficiaires: string[]): DossierDePieces {
  const dossier = DossierDePieces.vierge(SOCIETE.id);

  const attendues = [
    ...PIECES_EXIGEES_DE_LA_SOCIETE.map((type) => ({
      type,
      beneficiaireId: null as string | null,
    })),
    ...beneficiaires.flatMap((beneficiaireId) =>
      PIECES_EXIGEES_DU_BENEFICIAIRE.map((type) => ({
        type,
        beneficiaireId: beneficiaireId as string | null,
      })),
    ),
  ];

  for (const attendue of attendues) {
    dossier.deposer({
      type: attendue.type,
      beneficiaireId: attendue.beneficiaireId,
      // Le KBIS est le seul daté : émis de la veille, il est frais.
      dateEmission:
        attendue.type === TypePieceJustificative.KBIS
          ? new Date('2026-08-27')
          : null,
      fichier: fichier(),
      natureIdentite: natureDe(attendue.type),
      verso: exigeUnVerso(attendue.type, natureDe(attendue.type))
        ? fichier()
        : null,
      maintenant: LE_JOUR,
    });
  }

  // Les pièces n'ont pas d'identité tant qu'elles ne sont pas persistées :
  // l'instruction passe donc par les entités que la racine vient de rendre.
  for (const piece of dossier.pieces) piece.accepter(LE_JOUR);

  return dossier;
}

function monter() {
  // Typée plutôt que `jest.fn()` nu : le fait publié est ce que ces tests
  // examinent, et un `any` en ferait perdre la trace au vérificateur.
  const publish = jest.fn<void, [unknown]>();

  return {
    bus: { publish } as unknown as EventBus,
    publish,
    /** Le fait annoncé, ou `undefined` si rien ne l'a été. */
    annonce: () => publish.mock.calls[0]?.[0],
  };
}

describe('annoncerLaCompletude', () => {
  it('annonce un dossier qui réunit tout', () => {
    const { bus, publish } = monter();

    annoncerLaCompletude(
      bus,
      dossierComplet([BENEFICIAIRE]),
      SOCIETE,
      [BENEFICIAIRE],
      LE_JOUR,
    );

    expect(publish).toHaveBeenCalledWith(
      new DossierDePiecesCompleteDomainEvent(SOCIETE.utilisateurId, SOCIETE.id),
    );
  });

  it('annonce aussi quand il ne réunit plus rien — jamais le silence', () => {
    // Ne signaler que la complétude laisserait un KYB validé le rester après
    // qu'une de ses pièces a été refusée ou remplacée.
    const { bus, publish, annonce } = monter();

    annoncerLaCompletude(bus, DossierDePieces.vierge(SOCIETE.id), SOCIETE, []);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(annonce()).toBeInstanceOf(DossierDePiecesIncompletDomainEvent);
  });

  it('nomme ce qui manque, dans le motif que le titulaire lira', () => {
    const { bus, annonce } = monter();

    annoncerLaCompletude(bus, DossierDePieces.vierge(SOCIETE.id), SOCIETE, []);

    const evenement = annonce() as DossierDePiecesIncompletDomainEvent;
    expect(evenement.motif).toContain('Justificatifs à fournir');
  });

  it('déclare incomplet un dossier dont un bénéficiaire n’a pas sa pièce', () => {
    // Le dossier n'a pas bougé : c'est le registre qui a changé, et il réclame
    // désormais une pièce d'identité de plus.
    const { bus, annonce } = monter();

    annoncerLaCompletude(
      bus,
      dossierComplet([BENEFICIAIRE]),
      SOCIETE,
      [BENEFICIAIRE, 'beneficiaire-2'],
      LE_JOUR,
    );

    expect(annonce()).toBeInstanceOf(DossierDePiecesIncompletDomainEvent);
  });

  it('déclare incomplet un dossier dont le KBIS a vieilli', () => {
    // Un extrait accepté en août ne prouve plus rien six mois après : sans
    // cela, un KYB validé le resterait sur un document périmé.
    const { bus, annonce } = monter();

    annoncerLaCompletude(
      bus,
      dossierComplet([BENEFICIAIRE]),
      SOCIETE,
      [BENEFICIAIRE],
      new Date('2027-02-28T10:00:00.000Z'),
    );

    expect(annonce()).toBeInstanceOf(DossierDePiecesIncompletDomainEvent);
  });
});

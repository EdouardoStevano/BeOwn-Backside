import {
  PieceJustificative,
  PieceJustificativeSnapshot,
} from '../entities/piece-justificative';
import {
  exigeUnBeneficiaire,
  exigeUnVerso,
  PIECES_EXIGEES_DE_LA_SOCIETE,
  PIECES_EXIGEES_DU_BENEFICIAIRE,
  TypePieceJustificative,
} from '../enums/type-piece-justificative.enum';
import {
  BeneficiaireDeLaPieceIncoherentError,
  PieceJustificativeIntrouvableError,
  VersoDeLaPieceIncoherentError,
} from '../errors/piece-justificative.errors';
import { DecisionPiece } from '../value-objects/decision-piece.vo';
import { FichierDepose } from '../value-objects/fichier-depose.vo';

/** Ce qui manque au dossier, et pour qui. */
export interface PieceManquante {
  type: TypePieceJustificative;
  /** Le bénéficiaire concerné, `null` pour une pièce de la société. */
  beneficiaireId: string | null;
  /** Pourquoi elle manque — jamais déposée, refusée, ou périmée. */
  raison: 'absente' | 'refusee' | 'en_attente' | 'perimee';
}

/**
 * Les pièces justificatives d'une société, et la seule question qu'on leur
 * pose : **ce dossier tient-il ?**
 *
 * Un agrégat dédié, minuscule, plutôt qu'une collection sur `ProfilPM`. La
 * raison est celle de `ReservationCapacity` (§6) : la règle de complétude porte
 * sur **l'ensemble** des pièces d'une société, pas sur une pièce isolée, et
 * c'est cet ensemble qu'il faut charger pour la trancher. La faire vivre sur
 * `ProfilPM` obligerait à charger tous les justificatifs chaque fois qu'on lit
 * une raison sociale — un agrégat lourd pour une question qui ne le regarde pas
 * (§6.1). Le dossier référence sa société par identité, et rien d'autre (§6.2).
 *
 * **Il n'y a qu'une pièce par chose documentée.** Redéposer un KBIS ne crée pas
 * un second KBIS : il remplace celui qui était là, et son instruction repart de
 * zéro. C'est exactement ce que le cahier des charges demande — que le
 * titulaire « puisse modifier lui-même les documents refusés » — et c'est
 * aussi ce qui évite qu'un dossier accumule trois extraits contradictoires dont
 * personne ne saurait lequel fait foi.
 *
 * Ce que ce dossier **ne fait pas** : envoyer les pièces au prestataire de
 * paiement. Le cahier des charges le prévoit (« automatiquement envoyés au PSP
 * pour validation »), mais aucun contrat d'API ne le permet aujourd'hui —
 * Stripe Connect vérifie ses comptes Express par son propre parcours hébergé,
 * il n'accepte pas qu'on lui pousse des pièces. L'instruction est donc humaine,
 * comme l'est déjà la revue manuelle du KYC ; le jour où le contrat existe, il
 * prend la place du décideur sans que ces règles bougent.
 */
export class DossierDePieces {
  private readonly _societeId: string;
  private readonly _pieces: PieceJustificative[];

  /**
   * @internal Réservé au repository, qui compose le dossier depuis sa table.
   * Il n'éprouve rien : les invariants de chaque pièce sont posés au dépôt.
   */
  constructor(etat: { societeId: string; pieces: PieceJustificative[] }) {
    this._societeId = etat.societeId;
    this._pieces = [...etat.pieces];
  }

  /** Une société dont aucune pièce n'a encore été déposée. */
  static vierge(societeId: string): DossierDePieces {
    return new DossierDePieces({ societeId, pieces: [] });
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Dépose une pièce, ou remplace celle qui documentait déjà la même chose.
   *
   * « La même chose » se juge sur le type **et** le bénéficiaire : deux pièces
   * d'identité de bénéficiaires différents coexistent, deux KBIS non.
   *
   * @returns la pièce telle qu'elle est après dépôt — celle qui vient de naître
   *   ou celle qui vient d'être remplacée. L'appelant en a besoin pour la
   *   publier, et la retrouver ensuite l'obligerait à rejouer cette règle.
   */
  deposer(depot: {
    type: TypePieceJustificative;
    beneficiaireId: string | null;
    fichier: FichierDepose;
    /** Le dos du document — exigé pour une pièce d'identité, interdit ailleurs. */
    verso?: FichierDepose | null;
    dateEmission: Date | null;
    maintenant?: Date;
  }): PieceJustificative {
    const maintenant = depot.maintenant ?? new Date();
    const verso = depot.verso ?? null;

    // Le bénéficiaire est exigé par les pièces qui documentent une personne —
    // DBE-S1 et pièce d'identité —, interdit par celles qui documentent la
    // société. C'est ici et non dans le DTO : la règle vaut pour tout point
    // d'entrée, et c'est elle qui garantit que `documenteLaMemeChoseQue` sépare
    // bien deux bénéficiaires sans jamais séparer deux KBIS.
    const attendu = exigeUnBeneficiaire(depot.type);
    if (attendu !== (depot.beneficiaireId !== null)) {
      throw new BeneficiaireDeLaPieceIncoherentError(depot.type, attendu);
    }

    // Même forme, pour le dos du document. Un recto seul de carte d'identité ne
    // permet pas d'en vérifier la validité — la date d'expiration est au verso —
    // et un verso attaché à un KBIS désignerait une seconde page qui n'existe
    // pas.
    const versoAttendu = exigeUnVerso(depot.type);
    if (versoAttendu !== (verso !== null)) {
      throw new VersoDeLaPieceIncoherentError(depot.type, versoAttendu);
    }

    const existante = this._pieces.find((piece) =>
      piece.documenteLaMemeChoseQue(depot.type, depot.beneficiaireId),
    );

    if (existante) {
      existante.remplacerPar(
        depot.fichier,
        verso,
        depot.dateEmission,
        maintenant,
      );
      return existante;
    }

    const nouvelle = new PieceJustificative({
      entete: {
        // Attribuée par la persistance, comme partout dans ce contexte.
        id: undefined as unknown as string,
        type: depot.type,
        beneficiaireId: depot.beneficiaireId,
        dateEmission: depot.dateEmission,
        deposeeLe: maintenant,
      },
      fichier: depot.fichier,
      verso,
      decision: DecisionPiece.enAttente(),
    });

    this._pieces.push(nouvelle);
    return nouvelle;
  }

  /**
   * Instruit une pièce du dossier.
   *
   * Passe par la racine, et non par l'entité : c'est elle qui sait qu'une pièce
   * appartient bien à cette société. Sans ce passage, l'identifiant d'une pièce
   * d'un autre dossier suffirait à la trancher (§6).
   */
  accepterLaPiece(pieceId: string, le: Date = new Date()): PieceJustificative {
    const piece = this.piece(pieceId);
    piece.accepter(le);
    return piece;
  }

  refuserLaPiece(
    pieceId: string,
    motif: string,
    le: Date = new Date(),
  ): PieceJustificative {
    const piece = this.piece(pieceId);
    piece.refuser(motif, le);
    return piece;
  }

  // ── La règle de complétude ────────────────────────────────────────────────

  /**
   * Ce qui manque encore, et pourquoi.
   *
   * Le « pourquoi » compte autant que la liste : le titulaire à qui il manque
   * un KBIS et celui dont le KBIS a été refusé n'ont pas le même geste à faire,
   * et un écran qui dirait seulement « KBIS manquant » à quelqu'un qui vient
   * d'en déposer un serait incompréhensible.
   *
   * @param beneficiaires les bénéficiaires effectifs déclarés par la société.
   *   Ils viennent de l'appelant plutôt que du dossier : ils appartiennent à
   *   `RegistreDesBeneficiaires`, et les charger ici ferait de ce petit agrégat
   *   le propriétaire d'une liste qui ne lui appartient pas (§6.2). Le cahier
   *   des charges exige un DBE-S1 et une pièce d'identité **pour chacun** —
   *   leur nombre fait donc partie de la règle, mais pas de cet agrégat.
   */
  piecesManquantes(
    beneficiaires: readonly string[] = [],
    maintenant: Date = new Date(),
  ): PieceManquante[] {
    // Le produit des deux familles : trois documents pour l'entreprise, deux
    // par personne qui la contrôle. C'est ici que se voit ce que la constante
    // ne peut pas dire — le second facteur dépend du registre.
    const attendues: {
      type: TypePieceJustificative;
      beneficiaireId: string | null;
    }[] = [
      ...PIECES_EXIGEES_DE_LA_SOCIETE.map((type) => ({
        type,
        beneficiaireId: null,
      })),
      ...beneficiaires.flatMap((beneficiaireId) =>
        PIECES_EXIGEES_DU_BENEFICIAIRE.map((type) => ({
          type,
          beneficiaireId,
        })),
      ),
    ];

    const manquantes: PieceManquante[] = [];

    for (const attendue of attendues) {
      const piece = this._pieces.find((p) =>
        p.documenteLaMemeChoseQue(attendue.type, attendue.beneficiaireId),
      );

      if (!piece) {
        manquantes.push({ ...attendue, raison: 'absente' });
        continue;
      }
      if (piece.decision.estRefusee()) {
        manquantes.push({ ...attendue, raison: 'refusee' });
        continue;
      }
      if (piece.decision.estEnAttente()) {
        manquantes.push({ ...attendue, raison: 'en_attente' });
        continue;
      }
      // Acceptée, mais l'extrait a vieilli depuis.
      if (piece.estPerimee(maintenant)) {
        manquantes.push({ ...attendue, raison: 'perimee' });
      }
    }

    return manquantes;
  }

  /**
   * Le dossier réunit-il tout ce que le régulateur exige ?
   *
   * C'est l'invariant que cet agrégat existe pour porter, et la question que
   * la porte des opérations financières posera : une société ne souscrit pas
   * tant que son immatriculation, ses statuts, ses actionnaires et l'identité
   * de ses bénéficiaires n'ont pas été acceptés.
   */
  estComplet(
    beneficiaires: readonly string[] = [],
    maintenant: Date = new Date(),
  ): boolean {
    return this.piecesManquantes(beneficiaires, maintenant).length === 0;
  }

  /** Les pièces que le titulaire doit corriger lui-même, motif à l'appui. */
  piecesRefusees(): PieceJustificative[] {
    return this._pieces.filter((piece) => piece.decision.estRefusee());
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get societeId(): string {
    return this._societeId;
  }

  /**
   * Une pièce du dossier, par son identité.
   *
   * @throws PieceJustificativeIntrouvableError si elle n'est pas de ce dossier.
   *   Le message ne distingue pas « n'existe pas » de « appartient à une autre
   *   société » : le dire confirmerait l'existence d'un identifiant à qui n'y a
   *   pas droit.
   */
  piece(pieceId: string): PieceJustificative {
    // Une pièce qui vient d'être déposée n'a pas encore d'identité — c'est la
    // persistance qui l'attribue. Sans ce garde-fou, chercher par un
    // identifiant vide ferait correspondre `undefined === undefined` et
    // rendrait la première pièce non enregistrée du dossier : on instruirait
    // alors une pièce pour une autre.
    if (!pieceId) throw new PieceJustificativeIntrouvableError(pieceId);

    const piece = this._pieces.find(
      (candidate) => !!candidate.id && candidate.id === pieceId,
    );
    if (!piece) throw new PieceJustificativeIntrouvableError(pieceId);
    return piece;
  }

  /** Le dossier tel qu'il se publie — des primitives, pas les entités. */
  get piecesPubliees(): PieceJustificativeSnapshot[] {
    return this._pieces.map((piece) => piece.toSnapshot());
  }

  /**
   * @internal Réservé au repository, qui range chaque pièce dans sa ligne.
   *
   * Public faute de mieux — une porte nommée, là où un getter `pieces`
   * ordinaire se lirait comme une API et rendrait les entités modifiables hors
   * de leur racine.
   */
  get pieces(): readonly PieceJustificative[] {
    return this._pieces;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from '../ports/repositories/profil.repository';
import { ProfilPP } from 'src/profiles/domains/profil-pp';

/**
 * Champs du profil PP que son titulaire peut modifier lui-même.
 *
 * Contrat porté par la couche application — et non par le DTO de
 * présentation : la garde ne doit pas dépendre du `ValidationPipe` HTTP.
 * C'est précisément cette dépendance implicite qui a rendu C-3 exploitable
 * (un `@Body()` non typé par une classe désactive le pipe sans bruit).
 *
 * En sont volontairement absents :
 * - `utilisateurId` — clé primaire du profil ; l'assigner ferait porter le
 *   `save()` sur la ligne d'un AUTRE utilisateur ;
 * - `categoriePsfp` — calculée par le questionnaire d'adéquation, elle
 *   commande le plafond d'investissement et le délai de rétractation ;
 * - `patrimoineDeclare`, `montantMaxConseille`, `niveauRisque` et les dates
 *   de suivi commercial — établis par le questionnaire ou le back-office.
 */
export interface UpdateProfilPPInput {
  civilite?: string;
  /** Chaîne ISO `YYYY-MM-DD`, écrite telle quelle dans la colonne `date`. */
  dateNaissance?: string;
  lieuNaissance?: string;
  nationalite?: string;
  adresseLigne1?: string;
  adresseLigne2?: string;
  codePostal?: string;
  ville?: string;
  pays?: string;
  telephone?: string;
  profession?: string;
  secteurActivite?: string;
  /** Auto-déclaratif, comme à la création ; la compliance tranche via `aml:manage`. */
  pep?: boolean;
  residenceFiscale?: string;
  nif?: string;
}

@Injectable()
export class UpdateProfilPPUseCase {
  constructor(
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
  ) {}

  async execute(userId: number, dto: UpdateProfilPPInput): Promise<ProfilPP> {
    const profil = await this.profilRepository.findProfilPPByUserId(userId);
    if (!profil) {
      throw new NotFoundException('Profil PP non trouvé');
    }

    this.applyUpdate(profil, dto);
    return this.profilRepository.updateProfilPP(profil);
  }

  /**
   * Affectation champ à champ : seules les clés listées ici atteignent le
   * profil, quoi que contienne l'objet reçu (plus d'`Object.assign`).
   * `undefined` = champ non transmis → valeur courante conservée.
   */
  private applyUpdate(profil: ProfilPP, dto: UpdateProfilPPInput): void {
    if (dto.civilite !== undefined) profil.civilite = dto.civilite;
    if (dto.dateNaissance !== undefined) {
      // La chaîne ISO part telle quelle vers la colonne `date`, comme avant ce
      // correctif : la convertir en `Date` décalerait le jour d'un cran selon
      // le fuseau du serveur.
      profil.dateNaissance = dto.dateNaissance as unknown as Date;
    }
    if (dto.lieuNaissance !== undefined) profil.lieuNaissance = dto.lieuNaissance;
    if (dto.nationalite !== undefined) profil.nationalite = dto.nationalite;
    if (dto.adresseLigne1 !== undefined) profil.adresseLigne1 = dto.adresseLigne1;
    if (dto.adresseLigne2 !== undefined) profil.adresseLigne2 = dto.adresseLigne2;
    if (dto.codePostal !== undefined) profil.codePostal = dto.codePostal;
    if (dto.ville !== undefined) profil.ville = dto.ville;
    if (dto.pays !== undefined) profil.pays = dto.pays;
    if (dto.telephone !== undefined) profil.telephone = dto.telephone;
    if (dto.profession !== undefined) profil.profession = dto.profession;
    if (dto.secteurActivite !== undefined) {
      profil.secteurActivite = dto.secteurActivite;
    }
    if (dto.pep !== undefined) profil.pep = dto.pep;
    if (dto.residenceFiscale !== undefined) {
      profil.residenceFiscale = dto.residenceFiscale;
    }
    if (dto.nif !== undefined) profil.nif = dto.nif;
  }
}

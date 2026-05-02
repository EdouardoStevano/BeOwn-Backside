import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PROFIL_REPOSITORY } from '../ports/repositories/profil.repository';
import type { ProfilRepository } from '../ports/repositories/profil.repository';
import { CreateProfilPPDto } from 'src/profiles/presenters/dto/profil.dto';
import { ProfilPP } from 'src/profiles/domains/profil-pp';
import { CategoriePsfp } from 'src/profiles/domains/enums/kyc-status.enum';

@Injectable()
export class CreateProfilPPUseCase {
  constructor(
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
  ) {}

  async execute(userId: number, dto: CreateProfilPPDto): Promise<ProfilPP> {
    const existing = await this.profilRepository.findProfilPPByUserId(userId);
    if (existing) throw new ConflictException('Profil PP déjà existant.');

    const profil = new ProfilPP();
    profil.utilisateurId = userId;
    profil.civilite = dto.civilite ?? null;
    profil.prenom = dto.prenom;
    profil.nom = dto.nom;
    profil.nomNaissance = dto.nomNaissance ?? null;
    profil.dateNaissance = new Date(dto.dateNaissance);
    profil.lieuNaissance = dto.lieuNaissance ?? null;
    profil.paysNaissance = dto.paysNaissance ?? null;
    profil.nationalite = dto.nationalite ?? null;
    profil.adresseLigne1 = dto.adresseLigne1 ?? null;
    profil.adresseLigne2 = dto.adresseLigne2 ?? null;
    profil.codePostal = dto.codePostal ?? null;
    profil.ville = dto.ville ?? null;
    profil.pays = dto.pays ?? null;
    profil.telephone = dto.telephone ?? null;
    profil.profession = dto.profession ?? null;
    profil.secteurActivite = dto.secteurActivite ?? null;
    profil.pep = dto.pep ?? false;
    profil.residenceFiscale = dto.residenceFiscale ?? null;
    profil.nif = dto.nif ?? null;
    profil.categoriePsfp = CategoriePsfp.NON_AVERTI;

    return this.profilRepository.saveProfilPP(profil);
  }
}

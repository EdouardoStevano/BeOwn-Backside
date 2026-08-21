import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PROFIL_REPOSITORY } from '../ports/repositories/profil.repository';
import type { ProfilRepository } from '../ports/repositories/profil.repository';
import { CreateProfilPPDto } from 'src/profiles/presenters/dto/profil.dto';
import { ProfilPP } from 'src/profiles/domains/profil-pp';
// Chemin d'entité : version distante (src/users a été absorbé par iam).
// Enum de catégorie : `CategorieInvestisseur` du domaine PSFP (lot conformité),
// seule valeur utilisée par ce use case.
import { CategorieInvestisseur } from 'src/profiles/domains/investor-classification';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';

@Injectable()
export class CreateProfilPPUseCase {
  constructor(
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async execute(userId: number, dto: CreateProfilPPDto): Promise<ProfilPP> {
    const existing = await this.profilRepository.findProfilPPByUserId(userId);
    if (existing) throw new ConflictException('Profil PP déjà existant.');

    // prenom / nom sont NOT NULL et ne sont pas redemandés par le formulaire de
    // complétion : on les reprend de l'identité fournie à l'inscription.
    const user = await this.userRepo.findOne({ where: { userId } });

    const profil = new ProfilPP();
    profil.utilisateurId = userId;
    profil.prenom = user?.firstname?.trim() || '—';
    profil.nom = user?.lastname?.trim() || '—';
    profil.civilite = dto.civilite ?? null;
    profil.dateNaissance = dto.dateNaissance ? new Date(dto.dateNaissance) : null;
    profil.lieuNaissance = dto.lieuNaissance ?? null;
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
    profil.categoriePsfp = CategorieInvestisseur.NON_AVERTI;

    return this.profilRepository.saveProfilPP(profil);
  }
}

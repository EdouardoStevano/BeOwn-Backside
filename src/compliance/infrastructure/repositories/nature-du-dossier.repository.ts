import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NatureDeDossier } from 'src/compliance/domain/enums/nature-de-dossier.enum';
import { NatureDuDossierRepository } from 'src/compliance/domain/repositories/nature-du-dossier.repository';
import { InvestorComplianceProfileEntity } from '../persistence/entities/investor-compliance-profile.entity';

@Injectable()
export class NatureDuDossierTypeOrmRepository implements NatureDuDossierRepository {
  constructor(
    @InjectRepository(InvestorComplianceProfileEntity)
    private readonly registre: Repository<InvestorComplianceProfileEntity>,
  ) {}

  /**
   * `INSERT … ON CONFLICT DO NOTHING`, puis relecture.
   *
   * L'insertion conditionnelle est ce qui rend l'opération atomique : de deux
   * requêtes concurrentes, une seule écrit, et la clé primaire les sérialise.
   * La relecture qui suit rend donc la nature qui a gagné — la sienne ou celle
   * de l'autre — et non ce qu'on a tenté d'écrire.
   *
   * `orIgnore()` plutôt qu'un `findOne` préalable suivi d'un `save` : ce
   * dernier laisse entre les deux appels exactement la fenêtre que cette
   * méthode existe pour fermer.
   */
  async declarer(
    userId: number,
    nature: NatureDeDossier,
  ): Promise<NatureDeDossier> {
    // Le dossier peut déjà exister sans nature : un titulaire commence sa
    // vérification d'identité avant de choisir s'il investit en son nom propre
    // ou par une société. On l'insère s'il manque, puis on y pose la nature —
    // mais seulement si elle est encore vide, sinon la première déclaration ne
    // serait plus définitive.
    await this.registre
      .createQueryBuilder()
      .insert()
      .values({ userId, nature })
      .orIgnore()
      .execute();

    await this.registre
      .createQueryBuilder()
      .update()
      .set({ nature })
      .where('"userId" = :userId AND "nature" IS NULL', { userId })
      .execute();

    const ligne = await this.registre.findOne({ where: { userId } });

    // La ligne vient d'être écrite ou existait : elle ne peut pas manquer, et
    // sa nature non plus — on vient de la poser si elle était vide.
    return ligne!.nature!;
  }
}

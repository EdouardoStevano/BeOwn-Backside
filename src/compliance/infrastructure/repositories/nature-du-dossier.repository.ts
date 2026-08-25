import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NatureDeDossier } from 'src/compliance/domain/enums/nature-de-dossier.enum';
import { NatureDuDossierRepository } from 'src/compliance/domain/repositories/nature-du-dossier.repository';
import { DossierInvestisseurEntity } from '../persistence/entities/dossier-investisseur.entity';

@Injectable()
export class NatureDuDossierTypeOrmRepository implements NatureDuDossierRepository {
  constructor(
    @InjectRepository(DossierInvestisseurEntity)
    private readonly registre: Repository<DossierInvestisseurEntity>,
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
    await this.registre
      .createQueryBuilder()
      .insert()
      .values({ userId, nature })
      .orIgnore()
      .execute();

    const ligne = await this.registre.findOne({ where: { userId } });

    // La ligne vient d'être écrite ou existait : elle ne peut pas manquer.
    // Un `??` défensif masquerait une panne de la table derrière un
    // comportement plausible — mieux vaut que l'appel échoue franchement.
    return ligne!.nature;
  }
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestionnaireAdequationEntity } from '../../infrastructure/persistences/entities/questionnaire-adequation.entity';
import {
  AVERTISSEMENT_INADEQUATION,
  type ResultatTestConnaissances,
  evaluerTestConnaissances,
} from '../../domains/knowledge-test';
import { SaveTestConnaissancesDto } from '../../presenters/dto/questionnaire.dto';

/**
 * Résultat renvoyé au client après soumission du test de connaissances.
 * L'avertissement de l'art. 21(4) est fourni PAR LE SERVEUR : le front n'a pas
 * à connaître ni à recopier sa formulation réglementaire.
 */
export interface TestConnaissancesResponse extends ResultatTestConnaissances {
  avertissement: string | null;
  avertissementInadequationAccepte: boolean;
}

/**
 * Applique le résultat d'un test de connaissances sur une ligne de
 * questionnaire, SANS la persister.
 *
 * Extrait en fonction pure pour que la soumission combinée
 * (`POST /profiles/questionnaire`) et la soumission dédiée
 * (`POST /profiles/questionnaire/test-connaissances`) partagent exactement la
 * même règle et n'écrivent qu'une seule fois chacune.
 *
 * Art. 21(4) : l'accusé de réception est REMIS À ZÉRO à chaque soumission — un
 * nouveau résultat appelle un nouvel avertissement, un accusé antérieur ne peut
 * pas valoir pour une évaluation qu'il n'a pas vue.
 */
export function appliquerTestConnaissances(
  cible: QuestionnaireAdequationEntity,
  dto: SaveTestConnaissancesDto,
): ResultatTestConnaissances {
  let resultat: ResultatTestConnaissances;
  try {
    resultat = evaluerTestConnaissances(
      dto.score,
      dto.total,
      dto.domainesCouverts ?? [],
    );
  } catch (err) {
    // Le domaine refuse un score hors bornes (ex. 12/10) : c'est une erreur de
    // saisie du client, pas un incident serveur.
    throw new BadRequestException(
      err instanceof Error ? err.message : 'Test de connaissances invalide.',
    );
  }

  cible.testConnaissancesScore = resultat.score;
  cible.testConnaissancesTotal = resultat.total;
  cible.testConnaissancesAdequat = resultat.adequat;
  cible.avertissementInadequationAccepte =
    dto.avertissementInadequationAccepte ?? false;

  return resultat;
}

/** Réponse HTTP normalisée, avec le texte réglementaire quand il est dû. */
export function versReponseTestConnaissances(
  resultat: ResultatTestConnaissances,
  avertissementAccepte: boolean,
): TestConnaissancesResponse {
  return {
    ...resultat,
    avertissement: resultat.avertissementRequis ? AVERTISSEMENT_INADEQUATION : null,
    avertissementInadequationAccepte: avertissementAccepte,
  };
}

/**
 * Test de connaissances à l'entrée — art. 21(1) à 21(4) du règlement
 * (UE) 2020/1503.
 *
 * Soumission DÉDIÉE, indépendante de l'évaluation patrimoniale : l'art. 21(2)
 * impose un réexamen tous les deux ans, et l'investisseur doit pouvoir repasser
 * le test sans resaisir sa situation financière.
 *
 * Ce use case n'arbitre rien : le seuil d'adéquation et la formulation de
 * l'avertissement vivent dans `domains/knowledge-test.ts`.
 */
@Injectable()
export class SaveTestConnaissancesUseCase {
  private readonly logger = new Logger(SaveTestConnaissancesUseCase.name);

  constructor(
    @InjectRepository(QuestionnaireAdequationEntity)
    private readonly questionnaireRepo: Repository<QuestionnaireAdequationEntity>,
  ) {}

  async execute(
    userId: number,
    dto: SaveTestConnaissancesDto,
  ): Promise<TestConnaissancesResponse> {
    // Le test peut précéder l'évaluation patrimoniale : on crée la ligne au
    // besoin plutôt que d'imposer un ordre de parcours au front.
    let questionnaire = await this.questionnaireRepo.findOne({
      where: { utilisateurId: userId },
    });
    if (!questionnaire) {
      questionnaire = this.questionnaireRepo.create({ utilisateurId: userId });
    }

    const resultat = appliquerTestConnaissances(questionnaire, dto);
    const saved = await this.questionnaireRepo.save(questionnaire);

    this.logger.log(
      `Test de connaissances userId=${userId} score=${resultat.score}/${resultat.total} ` +
        `ratio=${resultat.ratio} adequat=${resultat.adequat} ` +
        `domainesManquants=[${resultat.domainesManquants.join(',')}]`,
    );

    return versReponseTestConnaissances(
      resultat,
      saved.avertissementInadequationAccepte,
    );
  }
}

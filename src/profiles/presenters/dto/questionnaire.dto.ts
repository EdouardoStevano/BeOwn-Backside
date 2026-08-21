import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { DomaineTestConnaissances } from '../../domains/knowledge-test';

/**
 * Évaluation de l'investisseur — règlement (UE) 2020/1503.
 *
 * Les seuils ne figurent pas dans ce DTO : ils appartiennent au domaine
 * (`src/profiles/domains/investor-classification.ts`). Le client déclare des
 * faits, le domaine décide.
 */
export class SaveQuestionnaireDto {
  // ── Annexe II, partie II — personne physique ─────────────────────────────

  @ApiPropertyOptional({ description: 'Revenu brut personnel par exercice fiscal (€)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  revenuBrutAnnuel?: number;

  @ApiPropertyOptional({
    description: 'Portefeuille d\'instruments financiers, dépôts en espèces inclus (€)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  portefeuilleInstrumentsFinanciers?: number;

  @ApiProperty({
    description:
      'Au moins un an dans le secteur financier à un poste qualifiant, ou douze mois de direction d\'une personne morale de la partie I',
  })
  @IsBoolean()
  experienceProfessionnelleFinanciere: boolean;

  @ApiPropertyOptional({
    description:
      'Nombre moyen d\'opérations de taille significative par trimestre sur les quatre derniers trimestres',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  transactionsMoyennesParTrimestre?: number;

  // ── Annexe II, partie I — personne morale ────────────────────────────────

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) fondsPropres?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) chiffreAffairesNet?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) totalBilan?: number;

  // ── Art. 21(5) — base de la simulation de capacité de perte ──────────────

  @ApiProperty({ description: 'Revenus réguliers et totaux sur l\'année (€)' })
  @IsNumber()
  @Min(0)
  revenuAnnuel: number;

  @ApiProperty({
    description:
      'Actifs : investissements financiers, biens personnels et d\'investissement, fonds de pension, dépôts (€)',
  })
  @IsNumber()
  @Min(0)
  actifsTotaux: number;

  @ApiProperty({ description: 'Engagements financiers réguliers, existants ou futurs (€)' })
  @IsNumber()
  @Min(0)
  engagementsFinanciers: number;

  @ApiProperty({ description: 'Prise de connaissance de la capacité de perte simulée' })
  @IsBoolean()
  simulationPerteAcceptee: boolean;

  // ── Art. 2(1)(j) — demande de statut averti ──────────────────────────────

  @ApiPropertyOptional({
    description:
      'Demande expresse d\'être traité comme investisseur averti. Sans cette demande, la catégorie reste « non averti » même si les critères sont remplis.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  demandeStatutAverti?: boolean;

  @ApiPropertyOptional({
    description:
      'Accusé de réception de l\'avertissement sur la perte des protections attachées au statut de non averti',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  avertissementStatutAvertiAccepte?: boolean;

  // ── Art. 21(1) à 21(4) — test de connaissances, soumission combinée ───────
  // Champs OPTIONNELS : le front historique n'envoie que l'évaluation
  // patrimoniale et continue de fonctionner à l'identique. Fournis ensemble,
  // `testConnaissancesScore` et `testConnaissancesTotal` déclenchent
  // l'évaluation d'adéquation et la persistance du résultat dans le même appel.

  @ApiPropertyOptional({
    description:
      'Nombre de bonnes réponses au test de connaissances. À fournir avec `testConnaissancesTotal`.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  testConnaissancesScore?: number;

  @ApiPropertyOptional({
    description:
      'Nombre total de questions du test. À fournir avec `testConnaissancesScore`.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  testConnaissancesTotal?: number;

  @ApiPropertyOptional({
    description: 'Domaines du règlement délégué (UE) 2022/2114 couverts par le test administré.',
    enum: DomaineTestConnaissances,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(DomaineTestConnaissances, { each: true })
  testConnaissancesDomaines?: DomaineTestConnaissances[];

  @ApiPropertyOptional({
    description:
      'Accusé de réception de l\'avertissement d\'inadéquation de l\'art. 21(4).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  avertissementInadequationAccepte?: boolean;
}

/**
 * Test de connaissances — art. 21(1). Soumis séparément de l'évaluation
 * patrimoniale : il ne confère aucun statut et n'interdit jamais d'investir.
 */
export class SaveTestConnaissancesDto {
  @ApiProperty({ description: 'Nombre de bonnes réponses' })
  @IsInt()
  @Min(0)
  score: number;

  @ApiProperty({ description: 'Nombre total de questions' })
  @IsInt()
  @Min(1)
  total: number;

  @ApiPropertyOptional({
    description:
      'Domaines du règlement délégué (UE) 2022/2114 couverts par le test administré. ' +
      'Sert à signaler un questionnaire incomplet — un défaut de conformité de la ' +
      'plateforme, non un échec de l\'investisseur.',
    enum: DomaineTestConnaissances,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(DomaineTestConnaissances, { each: true })
  domainesCouverts?: DomaineTestConnaissances[];

  @ApiPropertyOptional({
    description:
      'Accusé de réception de l\'avertissement d\'inadéquation, lorsque le score est insuffisant',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  avertissementInadequationAccepte?: boolean;
}

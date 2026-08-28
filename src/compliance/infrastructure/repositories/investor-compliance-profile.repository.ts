import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { ProfilInvestisseur } from 'src/compliance/domain/value-objects/profil-investisseur.vo';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import { InvestorComplianceProfileRepository } from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import { ClassementPsfp } from 'src/compliance/domain/value-objects/classement-psfp.vo';
import { SuiviInvestisseur } from 'src/compliance/domain/value-objects/suivi-investisseur.vo';
import { DecisionKyb } from 'src/compliance/domain/value-objects/decision-kyb.vo';
import { KycEntity } from '../persistence/entities/kyc.entity';
import { QuestionnaireAdequationEntity } from '../persistence/entities/questionnaire-adequation.entity';
import { InvestorComplianceProfileEntity } from '../persistence/entities/investor-compliance-profile.entity';
import { KycOrmMapper } from '../persistence/mappers/kyc.mapper';
import { ProfilMapper } from '../persistence/mappers/profil.mapper';

/** Le driver rend les colonnes `decimal` en chaîne. */
function nombreOuNull(valeur: number | string | null): number | null {
  return valeur === null ? null : Number(valeur);
}

/**
 * Compose la racine depuis les trois tables qui la portent.
 *
 * **C'est le seul chemin d'écriture du dossier de conformité**, et le seul
 * endroit qui sache que `kyc` et `questionnaire_adequation` se rattachent à
 * `investor_compliance_profile`. Les deux pièces ne connaissent plus le
 * titulaire : elles portent un `profileId`, que ce repository leur donne parce
 * que c'est lui qui tient la racine (§6, §16).
 *
 * `save` **crée la ligne racine si elle manque**. Un titulaire peut commencer
 * sa vérification d'identité avant d'avoir choisi sa nature ou rempli un
 * profil : le dossier de conformité doit alors naître, sinon la pièce n'aurait
 * rien à référencer.
 *
 * Limite assumée : les trois écritures ne partagent pas une transaction SQL.
 * Elles sont ordonnées — la racine d'abord, ses pièces ensuite — de sorte
 * qu'une interruption laisse au pire un dossier sans pièce, jamais une pièce
 * orpheline que la clé étrangère refuserait.
 */
@Injectable()
export class InvestorComplianceProfileTypeOrmRepository implements InvestorComplianceProfileRepository {
  constructor(
    @InjectRepository(KycEntity)
    private readonly dossiers: Repository<KycEntity>,
    @InjectRepository(QuestionnaireAdequationEntity)
    private readonly questionnaires: Repository<QuestionnaireAdequationEntity>,
    @InjectRepository(InvestorComplianceProfileEntity)
    private readonly racines: Repository<InvestorComplianceProfileEntity>,
  ) {}

  /** Le dossier du titulaire lui-même — celui qui porte le KYC. */
  findByInvestorId(investorId: number): Promise<InvestorComplianceProfile> {
    return this.charger(
      investorId,
      ProfilInvestisseur.personnePhysique(),
      IsNull(),
    );
  }

  /** Le dossier d'une société : son questionnaire, son classement, pas de KYC. */
  parSociete(
    investorId: number,
    societeId: string,
  ): Promise<InvestorComplianceProfile> {
    return this.charger(
      investorId,
      ProfilInvestisseur.societe(societeId),
      societeId,
    );
  }

  /**
   * Compose la racine d'un profil investisseur donné.
   *
   * `IsNull()` plutôt que `null` dans le critère : TypeORM traduit le premier
   * en `IS NULL` et ignore purement le second, ce qui rendrait ici le dossier
   * d'une société au titulaire qui demande le sien.
   */
  private async charger(
    investorId: number,
    souscripteur: ProfilInvestisseur,
    critereSociete: FindOptionsWhere<InvestorComplianceProfileEntity>['souscripteurSocieteId'],
  ): Promise<InvestorComplianceProfile> {
    const racine = await this.racines.findOne({
      where: { userId: investorId, souscripteurSocieteId: critereSociete },
    });

    // Aucun dossier ouvert : un titulaire qui n'a rien déposé a quand même une
    // éligibilité — négative — et c'est un état normal du parcours.
    if (!racine) {
      return InvestorComplianceProfile.vierge(investorId, souscripteur);
    }

    const [dossier, questionnaire] = await Promise.all([
      // Le KYC ne se lit que sur le dossier du titulaire : une société n'a pas
      // d'identité à vérifier, et l'aller chercher rendrait celui du
      // représentant comme s'il était le sien.
      souscripteur.estPersonnePhysique()
        ? this.dossiers.findOne({ where: { profileId: racine.id } })
        : Promise.resolve(null),
      this.questionnaires.findOne({ where: { profileId: racine.id } }),
    ]);

    return new InvestorComplianceProfile({
      id: racine.id,
      investorId,
      souscripteur,
      kycCase: dossier ? KycOrmMapper.toDomain(dossier) : null,
      adequacy: questionnaire
        ? ProfilMapper.questionnaireToDomain(questionnaire)
        : null,
      classement: ClassementPsfp.restore({
        categoriePsfp: racine.categoriePsfp,
        patrimoineDeclare: nombreOuNull(racine.patrimoineDeclare),
        montantMaxConseille: nombreOuNull(racine.montantMaxConseille),
      }),
      suivi: SuiviInvestisseur.restore(racine),
      // Les lignes écrites avant que ces colonnes n'existent rendent
      // `undefined` : `restore` les replie sur `EN_CONSTITUTION`, jamais sur
      // une validité présumée.
      kyb: DecisionKyb.restore(racine),
    });
  }

  async save(
    profile: InvestorComplianceProfile,
  ): Promise<InvestorComplianceProfile> {
    // La porte réservée au repository — voir `InvestorComplianceProfile.pieces`.
    const { kycCase, adequacy, classement, suivi, kyb } = profile.pieces;

    // La racine d'abord : ses pièces ont besoin de son identité.
    const racine = await this.racines.save({
      // `id` absent d'un dossier jamais écrit : TypeORM insère et l'attribue.
      ...(profile.id ? { id: profile.id } : {}),
      userId: profile.investorId,
      souscripteurSocieteId: profile.souscripteur.societeId,
      ...classement,
      ...suivi,
      ...kyb,
    });

    await Promise.all([
      kycCase
        ? this.dossiers.save(KycOrmMapper.toEntity(kycCase, racine.id))
        : Promise.resolve(),
      adequacy
        ? this.questionnaires.save(
            ProfilMapper.questionnaireToEntity(adequacy, racine.id),
          )
        : Promise.resolve(),
    ]);

    // Relu par le même profil qu'on vient d'écrire : relire par le titulaire
    // rendrait le dossier de la personne après avoir enregistré celui d'une de
    // ses sociétés.
    const souscripteur = profile.souscripteur;
    return souscripteur.estSociete()
      ? this.parSociete(profile.investorId, souscripteur.societeId as string)
      : this.findByInvestorId(profile.investorId);
  }
}

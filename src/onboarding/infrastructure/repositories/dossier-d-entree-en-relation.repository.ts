import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { ProfilInvestisseur } from 'src/onboarding/domain/value-objects/profil-investisseur.vo';
import { DossierDEntreeEnRelation } from 'src/onboarding/domain/aggregates/dossier-d-entree-en-relation';
import type { DossierDEntreeEnRelationRepository } from 'src/onboarding/domain/repositories/dossier-d-entree-en-relation.repository';
import { DecisionKyb } from 'src/onboarding/domain/value-objects/decision-kyb.vo';
import { KycEntity } from '../persistence/entities/kyc.entity';
import { InvestorComplianceProfileEntity } from '../persistence/entities/investor-compliance-profile.entity';
import { KycOrmMapper } from '../persistence/mappers/kyc.mapper';

/**
 * Compose le dossier d'entrée en relation depuis les deux tables qui le
 * portent.
 *
 * **C'est le seul chemin d'écriture du dossier**, et le seul endroit qui sache
 * que `kyc` se rattache à `investor_compliance_profile` par un `profileId`. La
 * pièce ne connaît plus le titulaire : elle porte cet identifiant, que ce
 * repository lui donne parce que c'est lui qui tient la racine (§6, §16).
 *
 * Il n'écrit plus **que ses colonnes** : le classement PSFP et la surveillance
 * ont leur table depuis que l'évaluation d'adéquation est un agrégat distinct.
 * Sans cela, enregistrer un verdict KYB aurait remis le classement à la valeur
 * lue au chargement.
 *
 * Limite assumée : les deux écritures ne partagent pas une transaction SQL.
 * Elles sont ordonnées — la racine d'abord, sa pièce ensuite — de sorte qu'une
 * interruption laisse au pire un dossier sans pièce, jamais une pièce orpheline
 * que la clé étrangère refuserait.
 */
@Injectable()
export class DossierDEntreeEnRelationTypeOrmRepository implements DossierDEntreeEnRelationRepository {
  constructor(
    @InjectRepository(KycEntity)
    private readonly dossiers: Repository<KycEntity>,
    @InjectRepository(InvestorComplianceProfileEntity)
    private readonly racines: Repository<InvestorComplianceProfileEntity>,
  ) {}

  /** Le dossier du titulaire lui-même — celui qui porte le KYC. */
  parTitulaire(investorId: number): Promise<DossierDEntreeEnRelation> {
    return this.charger(
      investorId,
      ProfilInvestisseur.personnePhysique(),
      IsNull(),
    );
  }

  /** Le dossier d'une société : son KYB, jamais de KYC. */
  parSociete(
    investorId: number,
    societeId: string,
  ): Promise<DossierDEntreeEnRelation> {
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
  ): Promise<DossierDEntreeEnRelation> {
    const racine = await this.racines.findOne({
      where: { userId: investorId, souscripteurSocieteId: critereSociete },
    });

    // Aucun dossier ouvert : un compte qui n'a rien déposé a quand même un
    // dossier — négatif — et c'est un état normal du parcours.
    if (!racine) {
      return DossierDEntreeEnRelation.vierge(investorId, souscripteur);
    }

    // Le KYC ne se lit que sur le dossier du titulaire : une société n'a pas
    // d'identité à vérifier, et l'aller chercher rendrait celui du représentant
    // comme s'il était le sien.
    const dossier = souscripteur.estPersonnePhysique()
      ? await this.dossiers.findOne({ where: { profileId: racine.id } })
      : null;

    return new DossierDEntreeEnRelation({
      id: racine.id,
      investorId,
      souscripteur,
      kycCase: dossier ? KycOrmMapper.toDomain(dossier) : null,
      // Les lignes écrites avant que ces colonnes n'existent rendent
      // `undefined` : `restore` les replie sur `EN_CONSTITUTION`, jamais sur
      // une validité présumée.
      kyb: DecisionKyb.restore(racine),
    });
  }

  async save(
    dossier: DossierDEntreeEnRelation,
  ): Promise<DossierDEntreeEnRelation> {
    // La porte réservée au repository — voir `DossierDEntreeEnRelation.pieces`.
    const { kycCase, kyb } = dossier.pieces;

    // La racine d'abord : sa pièce a besoin de son identité.
    const racine = await this.racines.save({
      // `id` absent d'un dossier jamais écrit : TypeORM insère et l'attribue.
      ...(dossier.id ? { id: dossier.id } : {}),
      userId: dossier.investorId,
      souscripteurSocieteId: dossier.souscripteur.societeId,
      ...kyb,
    });

    if (kycCase) {
      await this.dossiers.save(KycOrmMapper.toEntity(kycCase, racine.id));
    }

    // Relu par le même profil qu'on vient d'écrire : relire par le titulaire
    // rendrait le dossier de la personne après avoir enregistré celui d'une de
    // ses sociétés.
    const souscripteur = dossier.souscripteur;
    return souscripteur.estSociete()
      ? this.parSociete(dossier.investorId, souscripteur.societeId as string)
      : this.parTitulaire(dossier.investorId);
  }
}

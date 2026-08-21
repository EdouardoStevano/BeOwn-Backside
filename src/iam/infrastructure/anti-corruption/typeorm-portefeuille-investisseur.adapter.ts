import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import {
  PortefeuilleInvestisseur,
  ResumePortefeuille,
} from 'src/iam/application/ports/portefeuille-investisseur.port';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';

/**
 * Statuts qui sortent une souscription de l'encours : elle n'a jamais produit
 * d'engagement, ou le titulaire s'est rétracté.
 */
const STATUTS_MORTS: readonly InvestmentStatus[] = [
  InvestmentStatus.ANNULE,
  InvestmentStatus.RETRACTE,
];

/**
 * Anti-Corruption Layer (§20) entre `identity` et le contexte des
 * souscriptions : le seul endroit d'IAM qui connaisse `InvestmentEntity`.
 *
 * ⚠️ Correction de bug au passage. La requête d'origine, dans
 * `CgpController`, filtrait `inv.statut NOT IN ('ANNULE', 'RETRACTE')` — en
 * capitales, alors que la colonne stocke les valeurs de l'enum en minuscules
 * (`'annule'`, `'retracte'`). Aucune ligne ne matchait : **les souscriptions
 * annulées et rétractées étaient comptées dans l'encours** affiché aux
 * conseillers, et dans le nombre d'investissements de chaque client. La liste
 * des clients répétait la même faute côté JavaScript. Passer par l'enum rend
 * l'écart impossible — et fait mécaniquement baisser les chiffres affichés,
 * qui étaient faux.
 *
 * À terme, ce contrat a vocation à être publié par le contexte des
 * souscriptions lui-même plutôt que lu ici : tant qu'il ne l'est pas, l'ACL
 * confine la dépendance à ce seul fichier.
 */
@Injectable()
export class TypeOrmPortefeuilleInvestisseurAdapter
  implements PortefeuilleInvestisseur
{
  constructor(
    @InjectRepository(InvestmentEntity)
    private readonly investissements: Repository<InvestmentEntity>,
  ) {}

  async resumerPour(
    utilisateurIds: number[],
  ): Promise<Map<number, ResumePortefeuille>> {
    const resume = new Map<number, ResumePortefeuille>();
    if (utilisateurIds.length === 0) return resume;

    const lignes = await this.investissements.find({
      where: {
        utilisateurId: In(utilisateurIds),
        statut: Not(In(STATUTS_MORTS)),
      },
      select: ['utilisateurId', 'montant'],
    });

    for (const ligne of lignes) {
      const courant = resume.get(ligne.utilisateurId) ?? {
        nbInvestissements: 0,
        encours: 0,
      };
      courant.nbInvestissements += 1;
      courant.encours += Number(ligne.montant ?? 0);
      resume.set(ligne.utilisateurId, courant);
    }

    // Arrondi une seule fois, à la fin : arrondir chaque ligne ferait dériver
    // le total d'autant de demi-centimes qu'il y a de souscriptions.
    for (const valeur of resume.values()) {
      valeur.encours = Math.round(valeur.encours * 100) / 100;
    }

    return resume;
  }
}

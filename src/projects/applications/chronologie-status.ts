import { EtapeChronologie } from '../infrastructure/persistences/entities/project.entity';

/**
 * Recalcule les statuts d'une chronologie selon la date du jour :
 * - étapes dont la date est passée (≤ today) → 'done'
 * - la première étape future → 'in_progress' ; les suivantes → 'pending'
 * Pur, sans effet de bord. Ne throw jamais.
 */
export function computeChronologieStatuts(
  etapes: EtapeChronologie[],
  today: Date,
): EtapeChronologie[] {
  if (!Array.isArray(etapes) || etapes.length === 0) return etapes ?? [];
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  let inProgressAssigned = false;
  return etapes.map((e) => {
    const d = new Date(e.date);
    d.setHours(0, 0, 0, 0);
    let statut: EtapeChronologie['statut'];
    if (d.getTime() <= t.getTime()) {
      statut = 'done';
    } else if (!inProgressAssigned) {
      statut = 'in_progress';
      inProgressAssigned = true;
    } else {
      statut = 'pending';
    }
    return { ...e, statut };
  });
}

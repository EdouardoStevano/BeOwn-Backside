/**
 * Ramène à la date civile `AAAA-MM-JJ` ce que le driver Postgres rend d'une
 * colonne `date`.
 *
 * TypeORM rend une telle colonne sous forme de chaîne malgré le type `Date`
 * déclaré sur l'entité — mais un `save()` qui vient d'écrire la valeur rend
 * l'objet `Date` qu'on lui a passé. Les deux formes traversent donc la
 * frontière de persistance, et les deux se ramènent ici.
 *
 * **Extrait de `DecisionKyc`, où il vivait en privé.** Il sert désormais aussi
 * à `DecisionKyb`, et les deux échéances doivent se normaliser à l'identique :
 * la validité d'un KYB et celle d'un KYC ouvrent le même accès aux opérations
 * financières, et les comparer selon deux règles décalées d'un fuseau ferait
 * expirer l'une un jour avant l'autre.
 */
export function dateCivileOuNull(
  raw: Date | string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) return null;
  return raw instanceof Date
    ? raw.toISOString().slice(0, 10)
    : String(raw).slice(0, 10);
}

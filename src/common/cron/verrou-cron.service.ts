import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';

/**
 * Verrou distribué des tâches planifiées, adossé aux verrous consultatifs de
 * PostgreSQL (`pg_try_advisory_lock`).
 *
 * POURQUOI — `@Cron` s'exécute dans CHAQUE réplique. L'API tourne derrière un
 * HPA qui monte jusqu'à six pods : à 8 h 00, six exemplaires du balayeur de
 * distributions démarrent en même temps, sur les mêmes lignes. Les gardes
 * atomiques (`affected`, clés d'idempotence) évitent le double paiement, mais
 * pas le reste : six fois la charge de lecture, des verrous qui s'entre-
 * bloquent, des notifications en double, et des journaux illisibles le jour où
 * il faut comprendre ce qui s'est passé.
 *
 * POURQUOI UN VERROU CONSULTATIF, ET NON UNE TABLE — il ne survit pas à la
 * session : si le pod meurt au milieu du traitement, PostgreSQL libère le
 * verrou tout seul à la fermeture de la connexion. Une table de verrous
 * demanderait un TTL, donc une date d'expiration à choisir, donc un traitement
 * bloqué plus longtemps que prévu ou un verrou relâché trop tôt. Ici, rien à
 * régler et aucun verrou fantôme.
 *
 * CE QUE CE VERROU NE FAIT PAS — il n'est pas une garantie d'exécution unique
 * au sens fort : un pod qui perd sa connexion pendant le traitement libère le
 * verrou alors qu'il travaille encore. C'est un ANTI-CONCURRENCE, pas un
 * anti-rejeu. Les protections d'idempotence de chaque tâche restent
 * indispensables et ne sont pas remplacées.
 */
@Injectable()
export class VerrouCronService {
  private readonly logger = new Logger(VerrouCronService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Exécute `traitement` si et seulement si le verrou `nom` est obtenu.
   *
   * Rend `null` quand le verrou est déjà tenu par une autre réplique — ce
   * n'est PAS une erreur : c'est le fonctionnement nominal, et le journal le
   * dit en `debug` pour ne pas transformer la normalité en bruit.
   *
   * Le verrou est libéré dans un `finally` : une exception du traitement ne le
   * laisse jamais pris. La libération se fait sur la MÊME connexion que la
   * prise, ce qui impose de la réserver explicitement (le pool en donnerait
   * une autre, et `pg_advisory_unlock` échouerait sans bruit).
   */
  async executerSiSeul<T>(
    nom: string,
    traitement: () => Promise<T>,
  ): Promise<T | null> {
    const cle = VerrouCronService.cleDepuisNom(nom);
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();

    try {
      const [{ obtenu }] = await runner.query(
        'SELECT pg_try_advisory_lock($1) AS obtenu',
        [cle],
      );
      if (!obtenu) {
        this.logger.debug(
          `Tâche « ${nom} » déjà en cours sur une autre réplique — ignorée.`,
        );
        return null;
      }

      try {
        return await traitement();
      } finally {
        await runner
          .query('SELECT pg_advisory_unlock($1)', [cle])
          .catch((err: unknown) =>
            this.logger.error(
              `Verrou « ${nom} » non libéré : ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
      }
    } finally {
      await runner.release();
    }
  }

  /**
   * Nom de tâche → entier signé 64 bits, ce qu'attend `pg_try_advisory_lock`.
   *
   * Empreinte SHA-256 tronquée à 63 bits (le bit de poids fort est écarté pour
   * rester positif) : deux noms distincts n'entrent en collision qu'avec une
   * probabilité négligeable, et le même nom donne toujours la même clé, y
   * compris entre deux versions du code.
   *
   * `BigInt` et non `Number` : au-delà de 2^53, un flottant perdrait des bits
   * de poids faible et deux tâches différentes pourraient partager une clé.
   */
  static cleDepuisNom(nom: string): string {
    const empreinte = createHash('sha256').update(nom).digest('hex').slice(0, 16);
    const valeur = BigInt(`0x${empreinte}`) & BigInt('0x7fffffffffffffff');
    return valeur.toString();
  }
}

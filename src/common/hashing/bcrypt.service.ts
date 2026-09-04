import { Injectable } from '@nestjs/common';
import { HashingService } from './hashing.service';
import { compare, genSalt } from 'bcrypt';
import { hash } from 'bcrypt';

/**
 * Coût bcrypt des empreintes de mots de passe.
 *
 * `genSalt()` sans argument retient 10, la valeur par défaut de la
 * bibliothèque — inchangée depuis des années, et calibrée sur le matériel de
 * l'époque. Passer à 12 quadruple le travail d'une tentative : c'est le
 * facteur qui sépare, en cas de fuite de la table `users`, un cassage de
 * dictionnaire réalisable d'un cassage qui ne l'est plus à coût raisonnable.
 *
 * Le coût est encodé DANS l'empreinte (`$2b$12$…`) : les empreintes
 * existantes en `$2b$10$` restent parfaitement vérifiables — `compare()` lit
 * le coût de l'empreinte présentée. Aucune migration, aucune invalidation ;
 * les comptes existants remontent à 12 à leur prochain changement de mot de
 * passe.
 *
 * Contrepartie mesurée et acceptée : ~4× le temps CPU d'un hachage, sur deux
 * chemins seulement (connexion, changement de mot de passe), tous deux déjà
 * limités en débit.
 */
const COUT_BCRYPT = 12;

@Injectable()
export class BcryptService implements HashingService {
  async hash(data: string | Buffer): Promise<string> {
    const salt = await genSalt(COUT_BCRYPT);
    return hash(data, salt);
  }

  async compare(data: string | Buffer, encrypted: string): Promise<boolean> {
    return compare(data, encrypted);
  }
}

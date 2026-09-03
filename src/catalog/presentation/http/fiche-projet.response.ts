import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import {
  BlocDeContenuResponseDto,
  PhotoProjetResponseDto,
} from './dto/contenu-projet.dto';

/**
 * Décrit ce que rendent les routes de contenu éditorial : **le projet entier**,
 * contenu à jour.
 *
 * Toutes rendent le projet plutôt que le seul bloc ou la seule photo touchée,
 * et c'est délibéré : après un glisser-déposer, le back-office a besoin des
 * positions recalculées de *toute* la suite, et après un retrait de vignette, de
 * savoir laquelle a été promue. Rendre l'élément modifié imposerait une seconde
 * requête pour lire ce que l'opération vient de décaler.
 *
 * Le schéma est volontairement **partiel** — `additionalProperties: true` — et
 * ne détaille que les deux clés que ce changement introduit. Le reste de la
 * fiche (titre, conditions financières, calendrier, statut…) sort par ces routes
 * comme par `GET /projects/:id`, et n'est décrit nulle part ailleurs dans cette
 * API : prétendre le spécifier ici en ferait une seconde source de vérité,
 * vouée à diverger de `ProjectSnapshot` au premier champ ajouté. Documenter ce
 * qu'on introduit, et signaler le reste sans le figer.
 */
export const ApiFicheProjet = (description: string, status: 200 | 201 = 200) =>
  applyDecorators(
    ApiExtraModels(BlocDeContenuResponseDto, PhotoProjetResponseDto),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        description:
          'Le projet complet — mêmes clés que `GET /projects/{id}` —, dont son contenu éditorial à jour.',
        additionalProperties: true,
        properties: {
          id: { type: 'string', format: 'uuid' },
          titre: { type: 'string' },
          slug: { type: 'string' },
          descriptionCourte: {
            type: 'string',
            nullable: true,
            description:
              'Accroche de la fiche, affichée en liste et en partage. Le corps long reste dans `descriptionMd` ; les pavés éditoriaux sont dans `blocsDeContenu`.',
          },
          blocsDeContenu: {
            type: 'array',
            description:
              'Les pavés éditoriaux, dans l’ordre de lecture. Positions toujours contiguës à partir de 0.',
            items: { $ref: getSchemaPath(BlocDeContenuResponseDto) },
          },
          photos: {
            type: 'array',
            description:
              'La galerie : vignette (`position: 0`) d’abord, puis les vues. Vide si aucune photo n’a été déposée.',
            items: { $ref: getSchemaPath(PhotoProjetResponseDto) },
          },
        },
      },
    }),
  );

import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IamErrorFilter } from './iam-error.filter';
import {
  AccountClosedError,
  AccountDeletionBlockedError,
  AccountSuspendedError,
  EmailAlreadyRegisteredError,
  EmailNotVerifiedError,
  IamError,
  InvalidCredentialsError,
  InvalidEmailVerificationTokenError,
  InvalidRefreshTokenError,
  MFA_REQUIRED_CODE,
  MfaRequiredError,
  OtpDeliveryFailedError,
  UserNotFoundError,
} from 'src/iam/domains/errors';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';

/** Capture ce que le filtre écrirait sur la réponse HTTP. */
const render = (error: IamError) => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as any;

  new IamErrorFilter().catch(error, host);

  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
};

/** Corps que Nest produisait avec l'exception HTTP d'origine. */
const legacy = (exception: HttpException) => ({
  status: exception.getStatus(),
  body: exception.getResponse(),
});

describe('IamErrorFilter — équivalence avec les exceptions HTTP remplacées', () => {
  beforeAll(() => {
    // Le filtre loggue les erreurs UNEXPECTED : on garde la sortie de test propre.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it.each([
    [
      'identifiants invalides',
      new InvalidCredentialsError(),
      new UnauthorizedException('Adresse email ou mot de passe incorrect'),
    ],
    [
      'refresh token invalide (UnauthorizedException sans argument)',
      new InvalidRefreshTokenError(),
      new UnauthorizedException(),
    ],
    [
      'utilisateur introuvable',
      new UserNotFoundError(),
      new NotFoundException('Utilisateur introuvable'),
    ],
    [
      'email déjà utilisé',
      new EmailAlreadyRegisteredError(),
      new ConflictException('Un compte avec cette email existe déjà.'),
    ],
    [
      'token de vérification invalide',
      new InvalidEmailVerificationTokenError(),
      new BadRequestException('Token invalide ou expiré'),
    ],
    [
      "échec d'envoi de l'OTP",
      new OtpDeliveryFailedError(
        "Impossible d'envoyer le code par email. Réessayez dans un instant.",
      ),
      new InternalServerErrorException(
        "Impossible d'envoyer le code par email. Réessayez dans un instant.",
      ),
    ],
    [
      'email non vérifié (forme {code, message})',
      new EmailNotVerifiedError(),
      new UnauthorizedException({
        code: 'OTP_REQUIRED',
        message:
          'Veuillez vérifier votre adresse email avant de vous connecter.',
      }),
    ],
    [
      'compte suspendu (forme {statusCode, message, code})',
      new AccountSuspendedError(),
      new UnauthorizedException({
        statusCode: 401,
        message: 'Compte suspendu — contactez le support.',
        code: 'ACCOUNT_SUSPENDED',
      }),
    ],
    [
      'compte clos (forme {statusCode, message, code})',
      new AccountClosedError(),
      new UnauthorizedException({
        statusCode: 401,
        message: 'Compte clôturé — contactez le support.',
        code: 'ACCOUNT_CLOSED',
      }),
    ],
    [
      'suppression bloquée (forme plate {code, blockers}, sans message)',
      new AccountDeletionBlockedError([{ code: 'ACTIVE_INVESTMENTS' }]),
      new ConflictException({
        code: 'ACCOUNT_DELETION_BLOCKED',
        blockers: [{ code: 'ACTIVE_INVESTMENTS' }],
      }),
    ],
  ])(
    'produit la même réponse qu’avant pour %s',
    (_label, domainError: IamError, nestException: HttpException) => {
      expect(render(domainError)).toEqual(legacy(nestException));
    },
  );

  it("n'expose pas de clé message pour la suppression bloquée (contrat figé)", () => {
    const { body } = render(
      new AccountDeletionBlockedError([{ code: 'NO_IBAN' }]),
    );
    expect((body as Record<string, unknown>).message).toBeUndefined();
  });
});

describe('IamErrorFilter — forme standard', () => {
  it('publie le code et les details à la racine du corps', () => {
    // Sans cela, le front apprendrait qu'un second facteur manque sans savoir
    // lequel ni contre quel défi le prouver : `MfaRequiredError` serait
    // indiscernable d'un échec d'identifiants.
    const { status, body } = render(
      new MfaRequiredError({
        challengeId: 'challenge-1',
        method: MfaMethodType.SMS,
        sentTo: '+336***78',
      }),
    );

    expect(status).toBe(401);
    expect(body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      code: MFA_REQUIRED_CODE,
      message:
        'Double authentification requise — terminez la connexion sur POST /auth/sign-in/mfa.',
      challengeId: 'challenge-1',
      method: MfaMethodType.SMS,
      sentTo: '+336***78',
    });
  });

  it('omet la clé code quand l’erreur n’en porte pas', () => {
    // Le trio historique reste intact pour les erreurs sans contrat de code.
    expect(render(new InvalidCredentialsError()).body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Adresse email ou mot de passe incorrect',
    });
  });
});

import { Test } from '@nestjs/testing';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { UnauthorizedException } from '@nestjs/common';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { TOKEN_SERVICE } from 'src/iam/domains/ports/token.service';
import { USER_REPOSITORY } from 'src/users/applications/ports/repositories/user.repository';
import { SignInHandler } from './sign-in.handler';
import { SignInCommand } from './sign-in.command';

describe('SignInCommand via CommandBus', () => {
  let commandBus: CommandBus;
  const findByEmail = jest.fn();
  const compare = jest.fn();
  const generateTokens = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        SignInHandler,
        { provide: USER_REPOSITORY, useValue: { findByEmail } },
        { provide: HASHING_SERVICE, useValue: { compare } },
        { provide: TOKEN_SERVICE, useValue: { generateTokens } },
      ],
    }).compile();
    await moduleRef.init();
    commandBus = moduleRef.get(CommandBus);
  });

  const verifiedUser = {
    userId: 7,
    userEmail: { email: 'a@b.com', isVerified: true },
    role: 'USER',
    password: 'hashed',
  };

  it('returns tokens for valid credentials', async () => {
    findByEmail.mockResolvedValue(verifiedUser);
    compare.mockResolvedValue(true);
    generateTokens.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });

    const result = await commandBus.execute(
      new SignInCommand('a@b.com', 'pwd12345'),
    );

    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
    expect(generateTokens).toHaveBeenCalledWith({
      sub: 7,
      email: 'a@b.com',
      role: 'USER',
    });
  });

  it('rejects an unverified email', async () => {
    findByEmail.mockResolvedValue({
      ...verifiedUser,
      userEmail: { email: 'a@b.com', isVerified: false },
    });
    await expect(
      commandBus.execute(new SignInCommand('a@b.com', 'pwd12345')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a bad password', async () => {
    findByEmail.mockResolvedValue(verifiedUser);
    compare.mockResolvedValue(false);
    await expect(
      commandBus.execute(new SignInCommand('a@b.com', 'bad')),
    ).rejects.toThrow('Adresse email ou mot de passe incorrect');
  });

  it('rejects an unknown user', async () => {
    findByEmail.mockResolvedValue(null);
    await expect(
      commandBus.execute(new SignInCommand('x@y.com', 'pwd12345')),
    ).rejects.toThrow('Adresse email ou mot de passe incorrect');
  });
});

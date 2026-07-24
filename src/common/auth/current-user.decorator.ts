import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface ActiveUser {
  userId: number;
  email: string;
  role?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof ActiveUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as ActiveUser;
    return data ? user?.[data] : user;
  },
);

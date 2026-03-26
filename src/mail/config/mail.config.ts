import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => {
  return {};
});

export const SMS_SERVICE = Symbol('SMS_SERVICE');

export interface SmsService {
  sendOtp(phoneNumber: string, code: string): Promise<void>;
  sendTransactional(phoneNumber: string, message: string): Promise<void>;
}

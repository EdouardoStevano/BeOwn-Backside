export enum PaymentProvider {
  STRIPE = 'stripe',
  CINETPAY = 'cinetpay',
  FEDAPAY = 'fedapay',
  MANUEL = 'manuel',
}

export enum PaymentIntentStatus {
  REQUIRES_PAYMENT_METHOD = 'requires_payment_method',
  REQUIRES_CONFIRMATION = 'requires_confirmation',
  REQUIRES_ACTION = 'requires_action',
  PROCESSING = 'processing',
  REQUIRES_CAPTURE = 'requires_capture',
  CANCELLED = 'cancelled',
  SUCCEEDED = 'succeeded',
}

export enum PaymentOperationType {
  DEPOT = 'depot',
  RETRAIT = 'retrait',
  SOUSCRIPTION = 'souscription',
}

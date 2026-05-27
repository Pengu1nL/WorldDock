import { Injectable } from "@nestjs/common";

@Injectable()
export class EntitlementsService {
  getAlphaEntitlements() {
    return {
      publicPublishing: process.env.ALPHA_PUBLIC_PUBLISHING_ENABLED !== "0",
      betaPayments: false,
      stripeCheckout: false,
      stripeCustomerPortal: false,
      stripeWebhooks: false,
    };
  }
}

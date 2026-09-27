import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "./provider";

/**
 * Simulated payments for local development and tests: onboarding is instant and checkout goes to
 * Guildhall's simulated checkout page instead of Stripe. Never enabled in production.
 */
export const devProvider: PaymentProvider = {
  name: "dev",
  async createPayoutAccount(user, returnUrl) {
    return { accountId: `dev_acct_${user.id.slice(0, 8)}`, onboardingUrl: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}dev_onboarded=1` };
  },
  async onboardingLink(_accountId, returnUrl) {
    return returnUrl;
  },
  async payoutsEnabled() {
    return true;
  },
  async checkout(req) {
    const paymentRef = `dev_pay_${randomUUID()}`;
    const q = new URLSearchParams({
      milestone: req.milestoneId,
      ref: paymentRef,
      amount: String(req.amountCents + req.extraFeeCents),
      currency: req.currency,
      description: req.description,
      success: req.successUrl,
      cancel: req.cancelUrl,
    });
    const url = `/payments/dev-checkout?${q}`;
    return { url, paymentRef };
  },
  async transfer() {
    return { transferRef: `dev_tr_${randomUUID()}` };
  },
  async refund() {},
};

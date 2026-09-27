import Stripe from "stripe";
import type { PaymentProvider } from "./provider";

export function stripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

/** Stripe Connect (Express accounts, separate charges and transfers). */
export function stripeProvider(): PaymentProvider {
  const stripe = stripeClient();
  return {
    name: "stripe",
    async createPayoutAccount(user, returnUrl) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        capabilities: { transfers: { requested: true } },
        metadata: { guildhall_user: user.id },
      });
      return { accountId: account.id, onboardingUrl: await this.onboardingLink(account.id, returnUrl) };
    },
    async onboardingLink(accountId, returnUrl) {
      const link = await stripe.accountLinks.create({ account: accountId, refresh_url: returnUrl, return_url: returnUrl, type: "account_onboarding" });
      return link.url;
    },
    async payoutsEnabled(accountId) {
      const account = await stripe.accounts.retrieve(accountId);
      return Boolean(account.payouts_enabled);
    },
    async checkout(req) {
      const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        { quantity: 1, price_data: { currency: req.currency, unit_amount: req.amountCents, product_data: { name: req.description } } },
      ];
      if (req.extraFeeCents > 0) {
        line_items.push({ quantity: 1, price_data: { currency: req.currency, unit_amount: req.extraFeeCents, product_data: { name: "Guildhall flat contract fee" } } });
      }
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items,
        customer_email: req.customerEmail,
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        payment_intent_data: { transfer_group: `engagement_${req.engagementId}`, metadata: { milestone_id: req.milestoneId } },
        metadata: { milestone_id: req.milestoneId },
      });
      return { url: session.url!, paymentRef: session.id };
    },
    async transfer({ accountId, amountCents, currency, milestoneId, paymentRef }) {
      const session = await stripe.checkout.sessions.retrieve(paymentRef);
      const intent = await stripe.paymentIntents.retrieve(String(session.payment_intent));
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency,
        destination: accountId,
        source_transaction: String(intent.latest_charge),
        transfer_group: intent.transfer_group ?? undefined,
        metadata: { milestone_id: milestoneId },
      });
      return { transferRef: transfer.id };
    },
    async refund(paymentRef) {
      const session = await stripe.checkout.sessions.retrieve(paymentRef);
      await stripe.refunds.create({ payment_intent: String(session.payment_intent) });
    },
  };
}

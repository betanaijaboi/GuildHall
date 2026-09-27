/**
 * Payment provider interface. Guildhall holds funds per milestone and releases them to the
 * maker on approval ("separate charges and transfers" in Stripe Connect terms: the charge lands
 * in the platform balance, a transfer pays the maker later). Stripe offers delayed release, not a
 * licensed escrow; funds should be released within Stripe's holding limits.
 */
export type CheckoutRequest = {
  milestoneId: string;
  engagementId: string;
  description: string;
  amountCents: number;
  extraFeeCents: number;
  currency: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
};

export interface PaymentProvider {
  readonly name: "stripe" | "dev";
  /** Create a payout account for a maker and return an onboarding URL. */
  createPayoutAccount(user: { id: string; email?: string }, returnUrl: string): Promise<{ accountId: string; onboardingUrl: string }>;
  onboardingLink(accountId: string, returnUrl: string): Promise<string>;
  payoutsEnabled(accountId: string): Promise<boolean>;
  /** Start funding a milestone. Returns a URL to send the client to. */
  checkout(req: CheckoutRequest): Promise<{ url: string; paymentRef: string }>;
  /** Pay the maker their share of a funded milestone. */
  transfer(args: { accountId: string; amountCents: number; currency: string; milestoneId: string; paymentRef: string }): Promise<{ transferRef: string }>;
  refund(paymentRef: string): Promise<void>;
}

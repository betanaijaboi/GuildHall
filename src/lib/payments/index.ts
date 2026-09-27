import { devProvider } from "./dev";
import type { PaymentProvider } from "./provider";
import { stripeProvider } from "./stripe";

export function paymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) || devPaymentsEnabled();
}

export function devPaymentsEnabled(): boolean {
  return !process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_PAYMENTS === "true";
}

export function paymentProvider(): PaymentProvider {
  if (process.env.STRIPE_SECRET_KEY) return stripeProvider();
  if (devPaymentsEnabled()) return devProvider;
  throw new Error("Payments are not configured (set STRIPE_SECRET_KEY, or ENABLE_DEV_PAYMENTS=true locally)");
}

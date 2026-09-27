# Payments (Stripe Connect)

Guildhall holds each paid milestone and releases it on approval, using Stripe Connect
**Express accounts** with **separate charges and transfers**:

1. The client funds a milestone through Stripe Checkout. The charge lands in the platform
   balance, grouped by `transfer_group = engagement_<id>`.
2. When the milestone is approved (the client clicks *Approve & release*, or the linked asset
   review is approved), Guildhall creates a **transfer** to the maker's connected account, using
   the charge as `source_transaction`.
3. Fees follow C24: on the percentage model, 6% is kept and 94% is transferred. On the flat
   model, a one-off $29 is added to the client's first checkout and the maker receives 100%.

Stripe does not offer a licensed escrow. This is "delayed payout": keep release windows within
Stripe's limits for holding funds before transfer, and check the platform-liability rules for
your country before going live.

## Setup

1. Create a Stripe account and enable **Connect** (Express).
2. Set `STRIPE_SECRET_KEY` (test key first) and unset `ENABLE_DEV_PAYMENTS`.
3. Add a webhook endpoint `{APP_URL}/api/stripe/webhook` for `checkout.session.completed` and
   `account.updated`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. Makers connect payouts under **Settings → Payouts**.

## Local development

With `ENABLE_DEV_PAYMENTS=true` and no Stripe key, onboarding is instant and checkout goes to a
simulated page (`/payments/dev-checkout`). Nothing is charged. It is always disabled when
`NODE_ENV=production`.

## Contract flow

Draft (client) → send (the text is frozen and SHA-256 hashed) → both parties e-sign by typing
their name → **active**. Paid contractors get repo access only at this point. Then fund →
release per milestone → **completed** → both leave a 1–5 review. Disputes freeze a funded
milestone; resolution is manual for now.

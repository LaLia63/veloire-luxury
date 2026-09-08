# VÉLOIRE

VÉLOIRE is a cinematic luxury fashion and lifestyle commerce application for Women, Men and Kids. It combines a database-driven catalog, guest and account shopping, Google authentication, KPay proof submission, order tracking, returns, loyalty, digital receipts, an agentic bilingual private stylist, and a protected administration surface.

## Run locally

1. Copy `.env.example` to `.env.local` and add the project values.
2. Run `npm install`.
3. Run `npm run dev` and open `http://localhost:3000`.

The client receives only the Supabase publishable key. The service-role key and Gemini keys are server-only and must be configured as Vercel environment variables.

## Google OAuth configuration

In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID → Web application:

### Authorized JavaScript origins

- `http://localhost:3000`
- `https://YOUR-PRODUCTION-DOMAIN.vercel.app`
- Add a custom production domain here too, if one is connected later.

### Authorized redirect URIs

- `https://vlaigcvllbjvapktnirj.supabase.co/auth/v1/callback`

Google must return to Supabase’s Auth callback, not directly to the app’s `/auth/callback` route.

In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://YOUR-PRODUCTION-DOMAIN.vercel.app`
- Redirect URL: `http://localhost:3000/auth/callback`
- Redirect URL: `https://YOUR-PRODUCTION-DOMAIN.vercel.app/auth/callback`

In Supabase Dashboard → Authentication → Providers → Google, keep Google enabled and ensure the matching Client ID and Client Secret are saved.

## Database

The SQL migrations in `supabase/migrations` create only namespaced VÉLOIRE resources (`vlr_` tables and `vlr-` buckets), so unrelated tables in the shared Supabase project are not modified.

- Catalog: departments, categories, collections, products, media and dynamic variants
- Commerce: guest/account bag merge, wishlist, addresses, server-priced checkout, immutable order snapshots and payments
- Aftercare: order status, returns/refunds, notifications and downloadable digital receipts
- Privilege: verified-order earning, redemption limits and transaction ledger
- Security: RLS on every exposed VÉLOIRE table, private payment/return buckets and database-trusted admin assignment

The trusted admin email is `lia.thedev@gmail.com`. When that Google account first signs in, the database trigger creates or updates its VÉLOIRE profile with the `admin` role. A customer cannot promote their own role.

## VÉLOIRE Private Stylist

The server proxy attempts these models in order:

1. `gemini-3.6-flash`
2. `gemini-3.5-flash-lite`
3. `gemini-3.1-flash-lite`

Keys rotate server-side. If every model or key is unavailable, the app uses a catalog-constrained bilingual fallback. Structured AI actions may add, remove or set bag quantities, while price, stock, loyalty, order and admin mutations remain outside the model’s authority.

## Validation

Run `npm run build` before deployment. The production application is designed for Vercel’s Next.js runtime and uses optimized local WebP campaign imagery.

# Production Authentication Setup

## Canonical application URL

```text
https://anthetic-plus-studios.vercel.app
```

## Supabase DB1 → Authentication → URL Configuration

Set **Site URL** to:

```text
https://anthetic-plus-studios.vercel.app
```

Add this **Redirect URL**:

```text
https://anthetic-plus-studios.vercel.app/auth/callback
```

You may keep the local development callback separately:

```text
http://localhost:3000/auth/callback
```

## Google

In Supabase → Authentication → Providers → Google, use the Google OAuth
credentials for the production application.

In Google Cloud Console, the Authorized redirect URI must be the Supabase
Auth callback displayed by the Supabase Google provider, not the Vercel URL.

## Discord

Enable Discord under Supabase → Authentication → Providers → Discord.

In the Discord Developer Portal, add the Supabase Auth callback displayed by
the Supabase Discord provider as the OAuth2 redirect URI.

## Vercel

Set this Production environment variable:

```text
VITE_APP_URL=https://anthetic-plus-studios.vercel.app
```

Redeploy after changing it because `VITE_*` values are embedded during the Vite build.

The application OAuth flow then uses:

```text
https://anthetic-plus-studios.vercel.app/auth/callback
```

and never hard-codes localhost.

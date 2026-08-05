# Publish Research Hub at `teramap.co/researchhub`

Research Hub is ready to run under the `/researchhub` base path.

Live upstream (this repo / Vercel project **hubforopportunities**):

- `https://hubforopportunities-six.vercel.app/`
- `https://hubforopportunities-six.vercel.app/researchhub`

## One step on the Teramap Vercel project

`www.teramap.co` is a **different** Vercel project. Add these rewrites to **that** project's `vercel.json` (before any catch-all `/:path*` rule):

```json
{
  "rewrites": [
    {
      "source": "/researchhub",
      "destination": "https://hubforopportunities-six.vercel.app/researchhub"
    },
    {
      "source": "/researchhub/",
      "destination": "https://hubforopportunities-six.vercel.app/researchhub"
    },
    {
      "source": "/researchhub/:path*",
      "destination": "https://hubforopportunities-six.vercel.app/researchhub/:path*"
    }
  ]
}
```

A copy of this snippet lives in `deploy/teramap-proxy-vercel.json`.

After Teramap redeploys, open:

- https://www.teramap.co/researchhub
- https://teramap.co/researchhub (should redirect to www)

## Firebase Auth

In Firebase Console → Authentication → Settings → Authorized domains, add:

- `teramap.co`
- `www.teramap.co`

## Firestore rules

If library share is not live yet, publish `firestore.rules` from this repo (includes `sharedLibraries`).

## Why this agent cannot finish the Teramap click alone

The Teramap marketing site repo is not in this GitHub access scope (`elabaglama` only has `researchhub` and a few other repos — no Teramap source), and there is no Vercel CLI token in this environment. The rewrite must be added on the Teramap Vercel project (Dashboard → Project → Settings / or merge into that repo's `vercel.json`), then redeploy.

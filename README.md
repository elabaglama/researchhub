# Research Hub

Personal opportunity feed with per-user libraries (Firebase Auth + Firestore) and a shared scrape cache.

## Architecture

- **Library membership** → Firestore `users/{uid}/sources` (empty for new users)
- **Scraped listings** → Firestore `scrapeCache/{sourceId}` (shared by URL)
- **Scrape worker** → GitHub Actions reads the queue/cache, scrapes, writes Firestore (no git commits when users add links)

## One-time setup

### 1. Firestore security rules

In [Firebase Console](https://console.firebase.google.com/) → Project **researchhub** → Firestore → **Rules**, paste the contents of [`firestore.rules`](firestore.rules) and **Publish**.

Or with the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

Until rules allow `users/{uid}/**` for the signed-in user, the app cannot create collections (the Data tab stays empty).

### 2. Service account for Vercel + GitHub Actions

1. Firebase Console → Project settings → **Service accounts** → Generate new private key
2. Add the full JSON as:
   - Vercel → Project → Settings → Environment Variables → `FIREBASE_SERVICE_ACCOUNT`
   - GitHub → Repo → Settings → Secrets → `FIREBASE_SERVICE_ACCOUNT`
3. Keep existing `GITHUB_TOKEN` on Vercel (`contents:read` + `actions:write` is enough now; no Contents commits on add)

### 3. Verify

1. Sign up a new account on the site
2. Firestore **Data** should show `users/{uid}`
3. Add a library URL → `users/.../sources` and `scrapeQueue` / `scrapeCache` appear
4. Actions run **Scrape opportunities** → `scrapeCache` gets `items` and Home count updates

## Local development

```bash
npm start
```

Local `/api/scrape` runs the Python scraper on disk. Production uses Firestore + Actions.

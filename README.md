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

Until rules allow `users/{uid}/**` for the signed-in user (and `sharedLibraries/{code}` for sharing), the app cannot create collections (the Data tab stays empty). Re-publish rules after pulling updates that add `sharedLibraries`.

### 2. Service account (optional but recommended)

1. Firebase Console → Project settings → **Service accounts** → Generate new private key
2. Add the **entire JSON** as a secret named exactly:
   - GitHub → Repo → **Settings → Secrets and variables → Actions** → `FIREBASE_SERVICE_ACCOUNT`
   - Vercel → Project → Settings → Environment Variables → `FIREBASE_SERVICE_ACCOUNT`
3. Keep existing `GITHUB_TOKEN` on Vercel

If the GitHub secret is missing, scrapes still run and update `data/opportunities.json` (git fallback). With the secret set, results go to Firestore `scrapeCache` instead.

### 3. Verify

1. Sign up a new account on the site
2. Firestore **Data** should show `users/{uid}`
3. Add a library URL and Sync — the Actions run should succeed
4. Home count updates from your scraped sources

## Local development

```bash
npm start
```

Local `/api/scrape` runs the Python scraper on disk. Production uses Actions (+ Firestore when configured).


# AstroCourse Studio Vercel v1

This folder is a deployable copy of the original AstroCourse Studio v1 app.
It is separate from the local notebook app, so deploying this folder does not modify the app running on the laptop.

## What This Version Does

- Keeps the original v1 interface.
- Opens in share mode with the book project first: `/?mode=share`
- Keeps the owner password flow: `0727`
- Shares progress through `/api/state` when Vercel Blob Storage is connected.
- Also stores a local browser backup with `localStorage`.
- Uses `public/data/course_state.seed.json` as the built-in starting data.

## Shared Progress

Shared progress uses Vercel Blob.

After deploying to Vercel:

1. Open the Vercel project dashboard.
2. Go to Storage.
3. Create or connect Blob Storage.
4. Make sure `BLOB_READ_WRITE_TOKEN` is available in the project environment variables.
5. Redeploy the project.

When Blob is connected, all users read and save the same shared state through:

```text
/api/state
```

If Blob is not connected yet, the app still opens from the seed data and saves a local browser backup.

## Local Preview

From this folder:

```bash
npm run preview
```

Then open:

```text
http://127.0.0.1:4180/?mode=share
```

## Deploy To Vercel

1. Create a Vercel account.
2. Either upload this `deploy-vercel-v1` folder, or push it to a GitHub repository.
3. In Vercel, import the project.
4. Use these settings:

```text
Framework Preset: Other
Root Directory: deploy-vercel-v1
Build Command: leave empty
Output Directory: public
Install Command: leave empty
```

5. Deploy.
6. Connect Vercel Blob Storage.
7. Redeploy once more so shared progress is enabled.

Vercel will give a free address like:

```text
https://your-project-name.vercel.app/?mode=share
```

Owner/full access:

```text
https://your-project-name.vercel.app/?token=0727&course=main
```

## Free Domain Note

Vercel gives a free `vercel.app` subdomain. A separate free custom domain can be connected later if you get one from another provider, but the easiest stable free option is the Vercel subdomain.

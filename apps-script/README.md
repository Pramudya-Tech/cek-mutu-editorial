# Spreadsheet registry (Google Sheets + Apps Script)

The registry lets every browser see which steps a submission has been through and refuses a step that already
exists for the same submission ID (one Preliminary, one Pre-Acceptance, one Author Proof, and so on; peer review
is one entry per round and reviewer code). Revisions of an entry are allowed. Only the step, status, decision,
name, dates and document ID are stored; checklist answers and signatures stay in each person's browser.

## Set up (about 5 minutes)

1. Create a new Google Sheet, for example "Registri Cek Mutu".
2. Open **Extensions > Apps Script**, delete the sample code, and paste the contents of `Code.gs`.
3. Optional: set `SHARED_KEY` at the top to a long random text. Without it, anyone who knows the web app URL
   can add rows.
4. Click **Deploy > New deployment**, choose type **Web app**, set
   - **Execute as:** Me
   - **Who has access:** Anyone
   and click **Deploy**. Approve the permissions when asked.
5. Copy the **Web app URL** (it ends in `/exec`).
6. In the app, open **Tentang > Spreadsheet registri**, paste the URL (and the key if you set one), and click
   **Simpan dan uji koneksi**. To make it the default for everyone, put the URL and key in `src/data/config.json` instead
   and publish the app again.

The sheet named `Registri` is created on the first request. Do not rename its columns.

## When you change Code.gs

Use **Deploy > Manage deployments > Edit > New version**, so the URL stays the same.

## Limits

- Anyone with the URL (and the key, if set) can write rows, because the app has no login. Keep the URL within
  your editorial team and share reviewer and author links rather than the app settings.
- Apps Script allows roughly 20,000 requests a day on a free account, far above what a journal needs.

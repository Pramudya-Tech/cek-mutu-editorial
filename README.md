# Cek Mutu Editorial

A static React app for checking manuscripts against the journal's editorial quality checklists (version 2.3).
Editors, reviewers and authors fill a checklist section by section, upload a signature image, and export a
signed PDF as documentation of the check, plus an editorial decision email to copy and send. There is no
login and no connection to OJS. Answers and signatures stay in the browser; an optional Google Sheet keeps a
shared registry of which stages each submission ID has been through, so stages cannot be repeated.

## Run it locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev        # opens on http://localhost:5173
```

`npm run build` writes a production build to `dist/`; `npm run preview` serves that build locally.

## Publish on GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`, which builds the app and publishes it to
   `https://<user>.github.io/<repo>/`. Asset paths are relative (`base: './'` in `vite.config.js`), so no
   extra configuration is needed.

GitHub Pages is free for public repositories; a private repository needs a paid GitHub plan.

## What is where

| Path | Contents |
| --- | --- |
| `src/data/checklists/*.json` | The 11 checklists (Editor Gate 1 to 4 for each article type, Reviewer for each type, Author), generated from the v2.3 Word files |
| `src/data/journals.json` | Built-in journal list shown to everyone. Replace the example entry with your journals |
| `src/data/config.json` | Default spreadsheet registry URL and shared key for everyone using this build |
| `apps-script/` | Google Apps Script for the spreadsheet registry, with setup steps |
| `src/lib/process.js` | Stage order, next stage, duplicate checks against local history and the registry |
| `src/lib/mail.js` | Decision options per stage and the decision email templates (Indonesian and English) |
| `src/pages/` | Screens: start, checklist, history, journals, signature, about, role-link landing |
| `src/lib/pdf.js` | PDF export with pdf-lib: full check, one section, manuscript summary |
| `src/lib/hash.js` | Document ID (SHA-256 of the check's content) |
| `src/lib/db.js` | IndexedDB storage for drafts, history, journals and the saved signature |
| `src/lib/links.js` | Reviewer and proof-check links (preset values after the `#`, never sent to the server) |
| `src/styles.css` | Design tokens (royal blue, soft gold) and layout |

## Adding journals

Edit `src/data/journals.json`:

```json
[
  { "id": "jpt", "name": "Jurnal Pendidikan Teknologi", "abbr": "JPT", "issnPrint": "1234-5678", "issnOnline": "8765-4321", "sinta": 3, "citation": "APA 7" }
]
```

`abbr` is used in file names, for example `JPT-1010-Pre-Acceptance.pdf`. People can also add journals in
their own browser from the Jurnal page.

## Process per submission ID

One submission moves through: Preliminary, Peer Review (one entry per round and reviewer code), Pre-Acceptance,
Post-Acceptance, Author Proof, Publication. The ID field accepts digits only.

- **Riwayat** shows each submission with its `#ID` beside the title, a stage tracker, and a button to start or
  continue the next stage.
- A stage that already exists for that journal and ID cannot be started again; the app opens the existing one
  instead. Use **Revisi** on a finished check to correct it (a new revision, same stage).
- A Reject decision at Preliminary or Pre-Acceptance closes the process for that ID.
- After finishing a check, the decision email appears under the signature section: choose Indonesian or English,
  edit, then copy or download it.

## Spreadsheet registry (shared duplicate check)

Without it, duplicates are only caught inside one browser. With it, every editor, reviewer and author sees the
same stage list, and an author proof link can be used once per submission ID.

1. Follow `apps-script/README.md`: create a Google Sheet, paste `apps-script/Code.gs` into
   **Extensions > Apps Script**, and deploy as a Web app (Execute as: Me, Who has access: Anyone).
2. Put the `/exec` URL in `src/data/config.json` (`registryUrl`) so every user gets it, or set it per browser in
   **Tentang > Spreadsheet registri** and press **Simpan dan uji koneksi**.
3. Optional: set `SHARED_KEY` in `Code.gs` and the same value as `registryKey`. Because the app is static, the
   key is visible to anyone who opens it, so it only stops casual writes.

The sheet stores stage, status, decision, name, dates and document ID only, never checklist answers or
signatures. If the sheet cannot be reached, the app says so and offers to start without the check.

## Updating the checklists

The checklist files are data, not code. When the Word checklists change, regenerate the JSON files and bump
`version` inside each file. Finished checks keep the version they were filled with.

## Limits to know

- Role choice and role links guide people to the right checklist; they are not security. Links do not expire;
  with the registry connected, a stage can only be filled once per submission ID.
- Two people starting the same stage in the same second could both get through; the Apps Script lock makes
  this unlikely, not impossible.
- Data lives only in the browser. Clearing browser data deletes drafts and history, so keep the PDFs and use
  **Tentang > Cadangkan riwayat** for backups.
- The PDF uses the standard Helvetica font, so rare symbols (for example Greek letters) print as plain
  substitutes.

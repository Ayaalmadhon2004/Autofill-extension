# One-Click Form Filler (Chrome extension)

Fills job / internship / application forms from a profile you control. No server, no tracking: data stays in `chrome.storage.local`.

## Try it
1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Click the extension → **Edit my profile**, fill in your details, **Save**.
4. On any application form: click the icon → **Fill this page** (or press `Ctrl+Shift+F`). Review, then submit yourself — it never submits.

## How it works
- `fields.js`: one list of profile fields + how each is recognised (autocomplete attribute, label, name, id, placeholder).
- `filler.js`: injected on demand; sets values the way React/Vue forms expect; handles selects, radios, checkboxes.
- **Multiple profiles** (e.g. English and Arabic): create, duplicate, rename and delete them in Options, and pick the one to use from the popup. Arabic form labels (الاسم الأول، البريد الإلكتروني، الجامعة…) are recognised too.
- **Custom rules** (Options): "label contains X → answer Y". This is how it learns questions that are specific to you.
- **Teach this field**: right-click any form field → **Teach Form Filler this field…**, type the answer, and it is saved as a custom rule in the active profile (the same question again updates the rule). Works for text boxes, dropdowns, radios and checkboxes. Uses the `contextMenus` permission; the right-click is only read when you pick the menu item.
- **Common questions** (Options): answer work authorization, visa sponsorship, relocation, veteran/disability status, how you heard about us, 18+, criminal record, start date, salary expectations, remote/on-site and languages once per profile. Triggers (English and Arabic) live in `questions.js`. Priority: your custom rules, then these answers, then built-in fields.
- **Yes/No answers** match radios, dropdowns and checkboxes labelled Yes/No/نعم/لا by meaning, so "No" never picks "Not applicable" or "I know".
- **Export / Import JSON** in Options shares or backs up the current profile; importing adds it as a new profile.
- **Features: filler engine.**
  - Shadow DOM and iframes: fields inside open shadow roots (nested too) and in all frames are filled (Workday, Greenhouse, Lever style pages). Closed shadow roots and cross-origin frames the browser does not grant access to cannot be reached.
  - Fill report: required fields that are still empty get a dashed outline plus a "Required" text marker, and the popup lists them ("Filled N. M required fields need you:").
  - CV upload: in Options, **Documents**, upload a PDF/DOCX (max 5 MB) per profile. It is attached to file inputs that look like resume / CV / السيرة الذاتية (cover letter and photo inputs are skipped). Stored in `chrome.storage.local` only.
- **Application tracker**: each successful fill is logged locally (page address without query/hash, title, date, profile). Open **My applications** from the popup or Options to search, filter, set a status (Applied / Interviewing / Offer / Rejected / Saved), add notes, delete entries and export CSV. Turn it off in Options ("Track my applications").
- **Welcome page**: opens once after install with a 3-step intro (privacy promise, first profile, how to fill and update). Reopen it any time from the popup's "Help / How it works".
- **Work experience and education** (Options): add, remove and reorder entries (most recent first). On forms with repeated blocks the N-th block gets the N-th entry (blocks are found by index names like `[0]`/`_1`, fieldsets, or repetition in page order); a single block gets the first entry. Unclear blocks are skipped, never guessed.
- **Passphrase lock** (Options, optional): encrypts your profiles at rest with AES-GCM; the key comes from your passphrase via PBKDF2-SHA256 (600,000 iterations, random salt and IV). After you unlock once, the derived key lives only in `chrome.storage.session`, so it is gone when the browser closes. While locked the popup asks for the passphrase instead of filling, and `Ctrl+Shift+F` shows a 🔒 badge. **There is no passphrase recovery.** The lock covers your profiles only; the uploaded CV and the applications history are stored unencrypted in this browser.
- **Only fill on these sites** (Options, optional): a list of hostnames (`careers.example.com`, or `*.example.com` for a domain and its subdomains). When on, Fill is refused elsewhere with a clear message (popup text, or a `!` badge and tooltip for the shortcut). The popup has a one-click **Always allow this site**. Checked against the tab's address; the top page decides for all its frames.
- **Backup** (Options and popup): every N days (default 14, 0 = never) a "Back up your profiles" banner appears with a button that downloads one JSON with ALL profiles (plain `<a download>`, so no `downloads` permission). If a passphrase is set the file is encrypted with it (no plain text; the same passphrase is needed to import it); otherwise the UI warns that it contains plain text. **Import backup** merges every profile into yours without overwriting anything.
- Permissions: only `activeTab`, `scripting`, `storage`, `contextMenus` (for the right-click item). Passphrase lock, allowlist and backup need no extra permission. It reads no page unless you click.

## Sharing
Zip this folder and upload to the Chrome Web Store (one-time $5 developer fee), then link the store page from LinkedIn.

## Tests
`NODE_PATH=$(npm root -g) node tests/teaching.fill.test.js` (also `teaching.teach.test.js`, `teaching.options.test.js`) — Playwright, no network.

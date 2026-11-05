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
- **Export / Import JSON** in Options shares or backs up the current profile; importing adds it as a new profile.
- **Work experience and education** (Options): add, remove and reorder entries (most recent first). On forms with repeated blocks the N-th block gets the N-th entry (blocks are found by index names like `[0]`/`_1`, fieldsets, or repetition in page order); a single block gets the first entry. Unclear blocks are skipped, never guessed.
- **Passphrase lock** (Options, optional): encrypts your profiles at rest with AES-GCM; the key comes from your passphrase via PBKDF2-SHA256 (600,000 iterations, random salt and IV). After you unlock once, the derived key lives only in `chrome.storage.session`, so it is gone when the browser closes. While locked the popup asks for the passphrase instead of filling, and `Ctrl+Shift+F` shows a 🔒 badge. **There is no passphrase recovery.**
- Permissions: only `activeTab`, `scripting`, `storage`. It reads no page unless you click.

## Sharing
Zip this folder and upload to the Chrome Web Store (one-time $5 developer fee), then link the store page from LinkedIn.

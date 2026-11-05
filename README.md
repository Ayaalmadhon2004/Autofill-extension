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
- **Custom rules** (Options): "label contains X → answer Y". This is how it learns questions that are specific to you.
- **Export / Import JSON** in Options lets others share or back up a profile.
- Permissions: only `activeTab`, `scripting`, `storage`. It reads no page unless you click.

## Sharing
Zip this folder and upload to the Chrome Web Store (one-time $5 developer fee), then link the store page from LinkedIn.

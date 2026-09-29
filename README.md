# Kept – Prompt Manager & Backup

A simple, local prompt manager for Chrome. No account, no ads, no tracking. Your prompts stay in your browser.

## Features

- Add, edit, and delete prompts, with one folder each
- Search titles and text as you type
- One-click copy
- Folders: create, rename, delete (prompts in a deleted folder move to Uncategorized)
- Trash: deleted prompts can be restored; permanent deletion only happens from the Trash
- Backup: export everything to a JSON file and import it back, including anything the app doesn't use itself
- Backup status: shows when you last backed up and warns when new prompts aren't backed up yet
- Import from AI Prompt Genius (JSON or CSV) or from a Kept backup. Imports are checked in full first and only merge; they never overwrite. Exact duplicates (same title and text) are skipped.

## Privacy

- Data is stored with `chrome.storage.local`, on your computer only.
- Only two permissions: `storage` and `sidePanel`. No access to the websites you visit.
- The extension makes no network requests.
- Removing the extension deletes its data, so export a backup first.

See the [privacy policy](https://y0o0ng.github.io/kept/privacy.html).

## Run it locally

No build step. It is plain JavaScript (Manifest V3).

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Click the Kept icon in the toolbar to open the side panel.

## Tests

The data logic (`storage.js`) is pure functions with no Chrome API, so it runs under Node:

```
node --test
```

`storage.js` also holds a thin `chrome.storage.local` wrapper at the bottom. The UI lives in `sidepanel.html` and `sidepanel.js`.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension manifest (permissions: `storage`, `sidePanel`) |
| `background.js` | Opens the side panel when the toolbar icon is clicked |
| `sidepanel.html`, `sidepanel.js` | The side panel UI |
| `storage.js` | Data structure, edit/trash/folder/search logic, export and import, storage wrapper |
| `storage.test.js` | Tests for `storage.js` |
| `icons/` | Extension icons and the script that draws them (`node icons/make-icons.mjs`) |
| `testdata/` | Sample files for trying import (`node testdata/make-big.mjs` makes large ones) |
| `privacy.html` | Privacy policy page |

## Notes

- Kept is not affiliated with AI Prompt Genius. Import support is based only on a description of that tool's export format (title, text, folder, description, tags); none of its code was used or consulted.
- Chrome limits `chrome.storage.local` to about 10 MB. If storage is full, Kept asks you to export a backup first.

## License

[MIT](LICENSE)

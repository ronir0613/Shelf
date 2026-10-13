# Shelf

Shelf is a local-first Chrome extension for saving a page or link and getting a reminder to return to it.

## What it does

- Save the current page from the extension popup or right-click menu.
- Save a link from its right-click menu.
- Add an optional note and choose a reminder time, including a daily reminder.
- Open, edit, or delete saved items from the popup.
- Store saved items in Chrome's local extension storage. Shelf has no account, analytics, or remote service.

## Development

Requirements: Node.js and npm.

```sh
npm install
npm run dev
npm run lint
npm run build
```

To try the built extension, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the generated `dist` directory. After changing source files, run `npm run build` and reload Shelf from the extensions page.

`npm run build` type-checks the TypeScript and builds the popup, options page, and Manifest V3 service worker. The output is in `dist/`.

## Chrome Web Store release notes

- Upload a ZIP of the **contents** of `dist/`, with `manifest.json` at the ZIP root.
- Host `privacy-policy.html` at a stable public HTTPS URL and enter that URL in the Chrome Web Store Developer Dashboard.
- In the dashboard, describe the extension's single purpose, disclose that users' selected page URLs and titles are stored locally, and justify each requested permission. Keep those declarations consistent with the privacy policy and the extension's behavior.
- Prepare the store listing description, screenshots, and promotional images in the Dashboard. The repository currently contains extension icons, but not a complete listing media set.

The extension requests `storage`, `alarms`, `notifications`, `contextMenus`, and `activeTab`. It does not request broad host access. `activeTab` lets Shelf read the active page's title and URL after the user invokes the extension or its context-menu action.

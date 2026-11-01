# Captivum

Paste a link to a deadline or event. Check the date on a card. Confirm. An invite lands in your university Outlook calendar.

Captivum is a Chrome extension with no backend and no paid service. A small Google Apps Script on your personal Gmail sends the invite, and Outlook on the web shows Accept and Decline.

## How it works

1. You paste a link into the side panel (hackathon, paper call, grant, fellowship, event).
2. The extension opens the page in a background tab, using your own sign-ins, and reads the text.
3. A date parser (chrono-node plus keyword rules) finds deadlines and windows. It only asks a small AI model when it is unsure (no deadline found, year missing, time with no zone, conflicting dates). Anything the AI returns must appear word for word on the page, or it is dropped.
4. You review the card: name, dates, time zone, and the exact sentence each date came from. Titles look like `Opportunity name: Application window`.
5. On confirm, the extension posts to your Apps Script. The script creates an event on a calendar called Captivum with your university address as the guest. Google emails the invite.

Sender and receiver must be different accounts. The extension, the script and Outlook never share a login or a token.

## Install

Read [SETUP.md](SETUP.md). It takes about 15 minutes and needs no terminal. The built extension is in the `extension/` folder, so you can load it without Node.

## Develop

```
npm install
npm run build       # bundles src/ into extension/
npm run watch       # rebuild on change
npm run typecheck
npm test
```

Reload the extension in `chrome://extensions` after a build.

## Layout

```
extension/            built output plus manifest.json and icons (load this folder in Chrome)
apps-script/          Code.gs and appsscript.json for the sender
src/background.ts     service worker: runs extraction and delivery, retries, badge
src/sidepanel/        side panel UI (Add, History, Settings)
src/content/          reader injected into the page being read
src/lib/              parser, time zones, AI client, delivery, storage, counters
test/                 vitest suites, including Code.gs run against a fake Google
```

## Decisions that shape the code

| Topic | Choice |
| --- | --- |
| Surface | Chrome side panel, so edits are not lost when you click away |
| Reading pages | Background tab with your sign-ins, so LinkedIn and X work if you are logged in |
| Parsing | Parser first, AI only when unsure, code checks every AI date against the page |
| AI | Any OpenAI compatible endpoint. Gemini and Groq are preconfigured. They are tried in order |
| Delivery | Apps Script on the sender Gmail, Google Calendar invite, no OAuth in the extension |
| Windows | One multi day all day event from the start to the deadline |
| Single deadline with a time | A 30 minute event that ends at the deadline |
| AoE | Treated as UTC minus 12 |
| Retries | Network failures are queued and retried every 5 minutes with backoff |
| Idempotency | Every create carries a request id, so a retry never makes a duplicate |

## Things to verify with real accounts

These cannot be tested without your Google and Outlook accounts:

1. Outlook on the web shows Accept and Decline for a Google invite, and it does not land in Junk. Use Settings, then Send a test invite.
2. Updating and cancelling an event reaches Outlook. Use Remove the test invite and watch the calendar.
3. The preconfigured Gemini model name. It is editable in Settings if Google has renamed it.
4. Reading LinkedIn and X posts through the background tab while signed in.
5. Which AI provider is more accurate on your pages. Run about 25 links through each and compare.

## Design

- Palette from the Hello wallpaper swatch: `#000330`, `#000c58`, `#3457b1`, `#0030cf`, `#879ee2`.
- Lettering: Grandstander for headings and the wordmark, Nunito for text. Both are SIL OFL, bundled in `extension/fonts` with their licences.
- Mascot: an original black blob cat drawn in code (`cat()` in `src/sidepanel/ui.ts`). Moods: idle, looking (while reading or sending), happy, dizzy (errors), sleepy (empty history).
- Sticker style: thick outlines, hard shadows, uneven card corners. Light and dark mode follow the system.

## Privacy

Page text goes to an AI provider only when the parser is unsure and you added a key. Event details go only to your own Apps Script. There is no analytics and no server run by this project.

## License

Not chosen yet. Add a `LICENSE` file before publishing.

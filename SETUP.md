# Setup guide

You need two email accounts:

- **Sender**: a personal Gmail account. It owns the script that sends invites.
- **Receiver**: the university address that should get the invites. It can be any provider, including Outlook.

They must be different addresses. Captivum refuses to send otherwise.

Time needed: about 15 minutes. You will not use a terminal.

## 1. Install the extension

1. Download the project from GitHub (Code, then Download ZIP) and unzip it.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `extension` folder inside the project.
5. Click the puzzle icon in Chrome and pin **Captivum**. Clicking it opens the side panel.

## 2. Create the sender script

Do this while signed in to the **sender Gmail** account.

1. Go to [script.google.com](https://script.google.com) and click **New project**.
2. Delete the sample code. Open `apps-script/Code.gs` from the project, copy everything, and paste it in. Save.
3. Open **Project Settings** (gear icon). Turn on **Show "appsscript.json" manifest file in editor**.
4. Go back to the editor, open `appsscript.json`, and replace its contents with the file of the same name from the `apps-script` folder. Save.
   This switches on the Google Calendar advanced service the script needs.
5. In **Project Settings**, scroll to **Script properties** and add two properties:
   - `SECRET`: a long random string. Make one by mashing 30 or more letters and digits. You will paste the same string into the extension.
   - `RECEIVER`: the university email address.
6. Back in the editor, pick the function `doGet` in the top bar and click **Run**. Google asks you to authorise. Choose your account. If you see "Google hasn't verified this app", click **Advanced**, then **Go to (project name)**, then **Allow**. This is your own script, so that warning is expected.
7. Click **Deploy**, then **New deployment**. For the type choose **Web app**. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.

The secret protects the script. Without it, a request from anyone else is refused.

## 3. Link the extension

1. Open the Captivum side panel and go to **Settings**.
2. Paste the **Web app URL** and the **Secret**.
3. Click **Check connection**. You should see the sender and receiver addresses.
4. Click **Send a test invite**. Open Outlook on the web with the receiver account. Within a minute you should see an invite called "Captivum test invite" with **Accept** and **Decline**. Check Junk if it is missing.
5. Accept it, then click **Remove the test invite** in the extension. The entry should disappear from Outlook.

If step 4 or 5 does not behave, see the table below before going on.

## 4. Add an AI key (optional, recommended)

The parser handles most pages alone. A key lets Captivum double check pages where the parser is unsure. Both options are free.

- **Gemini**: create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
- **Groq**: create a key at [console.groq.com/keys](https://console.groq.com/keys).

Paste either key (or both) in Settings and click **Test key**. If both are set, Gemini is tried first and Groq is the fallback. Only the public text of a page is ever sent.

## 5. Set the time zone

In Settings, set **Default time zone** (for example `America/New_York`). It is used when a page gives a time but no time zone.

## Daily use

1. Copy a link.
2. Open the side panel and click **Paste**, then **Add**.
3. Check the card. Fix anything that looks wrong. Yellow notes tell you what Captivum was unsure about.
4. Click **Confirm and send**.

The footer shows today's invites, AI reads, and how many invites are left today. The toolbar badge shows today's count, or an exclamation mark when something is waiting to retry.

## Updating the script later

After editing the code in Apps Script, click **Deploy**, then **Manage deployments**, then the pencil icon, choose **New version**, and deploy. The URL stays the same.

## When something goes wrong

| What you see | What it means | Fix |
| --- | --- | --- |
| "Google returned a web page instead of data" | The script is not deployed to Anyone, or the URL is old | Redeploy as in step 2.7 and paste the new `/exec` URL |
| "The secret does not match" | The secret in the extension differs from the script property | Copy the same value into both |
| "Sender and receiver are the same address" | `RECEIVER` equals the Gmail that runs the script | Use a different receiver |
| "Add SECRET and RECEIVER" | Script properties are missing | Step 2.5 |
| Test invite never arrives | Outlook put it in Junk, or `RECEIVER` has a typo | Check Junk and the property value |
| Invite arrives with no Accept button | Outlook treated it as plain mail | Mark it Not junk, then try again. Tell the project, this is a known risk |
| "This page looks empty or blocked" | The page needs you to sign in, or blocks bots | Open the link in Chrome, sign in, then add it again |
| Yellow "Will retry" card | Google could not be reached | It retries every 5 minutes. Use **Try now** to force it |
| "The daily invite limit is used up" | The script cap of 100 a day was reached | Wait until tomorrow, or raise `DAILY_LIMIT` in Script properties |

## Optional script properties

| Property | Use |
| --- | --- |
| `CALENDAR_ID` | Send from a specific calendar. Set to `primary` to use the main calendar instead of a separate Captivum one |
| `CALENDAR_NAME` | Name of the separate calendar. Default `Captivum` |
| `DAILY_LIMIT` | Your own cap on invites per day. Default 100 |

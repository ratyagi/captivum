import type { PageSnapshot } from '../types';

const SPA_HOSTS = /(^|\.)(linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|threads\.net)$/;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitForLoad(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    // The tab may already be done by the time the listener is attached.
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && finish(), finish);
  });
}

type RawSnap = Omit<PageSnapshot, 'url' | 'finalUrl'> & { href: string };

async function read(tabId: number): Promise<RawSnap | null> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['reader.js'] });
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => (window as unknown as { __captivumRead: () => unknown }).__captivumRead(),
  });
  return (res?.result as RawSnap | undefined) ?? null;
}

/**
 * Opens the link in a background tab so the page loads with the person's own sign-ins,
 * reads it, and closes the tab.
 */
export async function fetchPageViaTab(url: string): Promise<PageSnapshot> {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('That is not a valid link.');
  }
  if (/\.pdf($|\?)/i.test(url)) throw new Error('PDF links are not supported yet. Open the page that links to the PDF instead.');

  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error('Chrome did not open the page.');
  try {
    await waitForLoad(tabId, 25000);
    const spa = SPA_HOSTS.test(host);
    await sleep(spa ? 3500 : 1500);
    let snap = await read(tabId).catch((e) => {
      throw new Error(`Chrome would not let Captivum read this page. ${(e as Error).message}`);
    });
    if (spa && snap && snap.text.trim().length < 300) {
      await sleep(2500);
      snap = (await read(tabId)) ?? snap;
    }
    if (!snap) throw new Error('The page returned nothing to read.');
    const { href, ...rest } = snap;
    return { url, finalUrl: href || url, ...rest };
  } finally {
    chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

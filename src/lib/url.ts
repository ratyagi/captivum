const TRACKING = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|igshid|ref_src|ref_url|trk|trackingid|li_fat_id)$/i;

/** Pulls the first link out of whatever the person pasted and removes tracking parameters. */
export function extractUrl(input: string): string | null {
  if (!input) return null;
  const m = input.match(/https?:\/\/[^\s<>"')\]]+/i);
  let candidate = (m ? m[0] : input.trim()).replace(/[.,;:!?]+$/, '');
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(candidate)) candidate = 'https://' + candidate;
    else return null;
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.replace(/^www\./, '');
    const isX = host === 'x.com' || host === 'twitter.com';
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING.test(key) || (isX && (key === 's' || key === 't'))) u.searchParams.delete(key);
    }
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

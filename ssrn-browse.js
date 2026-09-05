// ssrn-browse.js — read ONE SSRN page the server is not allowed to read.
//
// Measured 2026-09-05 against the live site: every eJournal listing fetch from
// the backend is refused by Cloudflare in ~2.5s (403, `cf-mitigated: challenge`),
// and the shared listing cache in production was empty as a result — so "Browse
// eJournals" and every newsletter scan had nothing to show. The reader's own
// browser is not blocked. This script is the half that runs there.
//
// It does NOTHING on its own. On every SSRN page it asks the service worker one
// question — "was this page asked for?" — and only a page the reader opened by
// pressing a button in the app is armed (background.js `_armBrowse`, 30-minute
// TTL, matched on the journal id). Un-armed SSRN browsing is never read, never
// sent, never logged.
//
// What it sends is the PAGE, not rows: the backend runs the same parser the
// blocked server fetch used, so the extension never has to know what an SSRN
// listing looks like and the two paths cannot drift.
(function essenceScholarSsrnBrowse() {
  const HOST_RX = /(^|\.)ssrn\.com$/i;
  if (!HOST_RX.test(location.hostname)) return;

  const LISTING_SELECTOR = '.paper-info';
  const WAIT_MS = 60000;          // a Cloudflare check the reader has to click through
  const POLL_MS = 500;

  // Cloudflare's interstitial, seen from inside the page. When it is up there is
  // nothing to send yet — the reader has to satisfy it first, and the page then
  // reloads and runs this script again.
  const isChallenge = () =>
    Boolean(document.getElementById('challenge-form')
      || document.getElementById('cf-challenge-running')
      || document.querySelector('#challenge-running, .cf-browser-verification')
      || /just a moment|checking your browser/i.test(document.title || ''));

  /** The page with its scripts and styles dropped — a third of the bytes, and
   *  none of them are what the listing parser reads. */
  function pageHtml() {
    try {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, svg, iframe').forEach(n => n.remove());
      return '<html>' + clone.innerHTML + '</html>';
    } catch (_) {
      return document.documentElement.outerHTML;
    }
  }

  /** Resolves once the listing is on the page, the challenge is clearly up, or
   *  we have waited long enough to say so. */
  function waitForListing() {
    return new Promise(resolve => {
      const started = Date.now();
      const check = () => {
        if (document.querySelector(LISTING_SELECTOR)) return resolve('listing');
        if (Date.now() - started > WAIT_MS) return resolve(isChallenge() ? 'challenge' : 'timeout');
        return null;
      };
      if (check() !== null) return;
      const t = setInterval(() => { if (check() !== null) clearInterval(t); }, POLL_MS);
    });
  }

  const ask = (msg) => new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(msg, (res) => { void chrome.runtime.lastError; resolve(res || null); });
    } catch (_) {
      resolve(null);   // a dead service worker: nothing to do, the app falls back to polling
    }
  });

  (async () => {
    const armed = await ask({ action: 'browseArmedFor', url: location.href });
    if (!armed || !armed.armed) return;
    const state = await waitForListing();
    if (state !== 'listing') {
      // Report it rather than going quiet — but report WHICH of the two it is.
      // A challenge is something only the reader can clear, and their tab is
      // brought forward for it. A timeout is a page that loaded and had no
      // listing on it; telling them to click a human check that is not on screen
      // sends them looking for something that does not exist.
      await ask({ action: 'browseCapture', url: location.href, journal_id: armed.journal_id || '',
                  challenge: true, reason: state, html: '' });
      return;
    }
    await ask({ action: 'browseCapture', url: location.href,
                journal_id: armed.journal_id || '', html: pageHtml() });
  })();
})();

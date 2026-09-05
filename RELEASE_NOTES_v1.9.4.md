# Essence Scholar extension 1.9.4 — attended browsing

## Why

SSRN's eJournal listing pages are behind Cloudflare for machines. Measured against
the live site on 2026-09-05: **every** fetch of
`papers.ssrn.com/sol3/JELJOUR_Results.cfm` from the server is refused in ~2.5s with
a 403 and `cf-mitigated: challenge`. Two features stood on that fetch and had
nothing to show:

* the notebook import's **Browse eJournals** — "click one to load its papers";
* **newsletters**, whose weekly scan reported "no new papers" while reading a
  listing that was last refreshed on 2 August.

The reader's own browser is not blocked. 1.9.3 already used that fact for
downloads; 1.9.4 uses it for pages.

## What was added

* **`ssrn-browse.js`** — a content script on `*.ssrn.com` that does nothing at all
  unless the page it is on was **armed** by a click in the app. When armed, it waits
  for the listing to render (through Cloudflare's check, if one appears), strips
  scripts and styles, and hands the page to the service worker.
* **`background.js`** — `armBrowse` (arm a set of journals and open their tabs),
  `browseArmedFor` (the content script's one question), `browseCapture` (POST the
  page to `/ssrn/attended-page`, then close the tab it opened). Arms expire after
  30 minutes and are dropped as soon as their page has been read.
* **`app-bridge.js`** — the app can now say `browse-ssrn`, and progress comes back
  as `browse-progress` (`captured` / `challenge` / `error`) so the panel moves while
  it happens.

## What it does NOT do

* It does not read SSRN pages you browse yourself. Only an armed journal is read,
  and arming happens in the app, on your click, naming the journal.
* It does not parse anything. The page goes to your own backend, which runs the same
  parser the (blocked) server fetch used — so the extension has no opinion about what
  an SSRN listing looks like, and cannot drift from the server.
* It does not send papers anywhere else. The capture goes to the backend the
  extension is already signed in to, with your API key.

## Needs

Nothing new: the same API key, the same permissions as 1.9.3. "Allow access to file
URLs" is only needed for the download capture, not for this.

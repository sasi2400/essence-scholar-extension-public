# v1.9.2 — Download capture: consent + academic-source scoping

**Privacy fix.** v1.9.1's download capture ingested EVERY completed PDF
download in the browser — any site, any file — reading it from disk and
uploading it without asking. Personal documents (statements, contracts)
silently landed in the library.

Now:

- **Scope:** only downloads from academic sources (SSRN, NBER, arXiv, RePEc,
  major journal publishers) are ever considered. A PDF from any other site is
  never read, never uploaded.
- **Consent:** default mode asks first — a notification with Import / Ignore.
  Settings (extension ⚙️) offers: Ask me first (default) · Import
  automatically (academic sources only) · Never.
- New `notifications` permission supports the Import/Ignore prompt.

Server-side counterpart (backend): deleting a paper now also removes the
retained PDF bytes from storage when nothing else references them.

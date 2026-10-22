# T11 public guarded search

PR #4 merged after Quality CI succeeded at commit
`4dbe07fb5fc76781ff3285b5840404a4532fd8d3`. T11 builds on that approved pipeline.

## Reference and scope

Inspected the signed-in Perplexity home, researching state, completed answer,
inline citations and expanded source pane on 22 October 2026. The reference query
was “Why do rainbows form?”; no personal question was sent. At 1280×720 its narrow
sidebar is 56px, the answer column is approximately 720px, and the source pane is
320px with a 16px right margin. The current answer uses serif body text, a small
right-aligned question bubble, restrained domain citation chips, and a pinned
follow-up composer. Local comparison screenshots are ignored under
`.artifacts/reference/`. System serif fonts approximate the reference's custom
font; exact font identity and every Perplexity feature are not claimed.

Match these screens in the existing CSS system. Keep responsive source access,
keyboard navigation, reduced motion, fixed progress labels and readable errors.
Only approved source titles/URLs are visible; unapproved passages, generated
summaries and provider reasoning never become preview cards. No remote favicons
or images are automatically fetched on the user's behalf.

## Release boundary

The public route accepts one newest question and intent metadata, never browser
history, provider settings or guard overrides. Compose admission, input approval,
bounded retrieval, private drafting, output approval and atomic commit in order.
Use the installed AI SDK UI-message stream protocol. Progress is application-owned;
no private model stream is merged into it. Deliver approved response text and
source presentation only after canonical commit and a fresh ownership/session read.

Compile approved Markdown into a bounded render tree on the server. Browser
components render only explicit React elements; HTML, arbitrary Markdown links,
images and model-supplied URLs have no rendering path. Source links use server
registry values with noopener/noreferrer and no-referrer. On reload, validate the
stored payload/body hashes against the exact message before exposing presentation.
Legacy current-policy approved text remains escaped text without invented sources.

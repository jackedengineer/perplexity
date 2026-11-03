# Workspace entry and sidebar motion

The homepage redirects to `/workspace`. The workspace is public to view and type
in; guests still establish their existing bounded, challenged trial before using
AI. Signed-in users use the existing authenticated workspace frame. Private
history, search, jobs and API ownership gates are unchanged.

Visitors and guest accounts have a compact highlighted Sign up / Log in link.
Visitor drafts use tab-scoped session storage and are restored into the composer
following authentication. Visitor shells do not load model/usage APIs or mount
session-renewal controls. Signing out returns to the public workspace.

Desktop sidebar width transitions take 180ms. Mobile dialogs use CSS discrete
open/close transitions with an immediate fallback on unsupported browsers.
Reduced-motion preferences disable navigation animations.

Validation: lint/types and 14 targeted unit tests pass. The credential-free
Cloudflare build passes its private-cache checks. Optimized real-browser entry,
visitor controls and desktop collapse/expand were verified without AI calls.
Foundation browser regressions cover public entry, private-history denial,
sign-in navigation, draft retention, navigation and reduced motion; CI is required.

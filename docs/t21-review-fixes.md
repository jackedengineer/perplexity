# T21 current-review corrections and bounded live rerun

23 October 2026. Candidate code: `b8b0554`. This record supplements the
[earlier observations](openrouter-live-verification.md); it does not replace them.
Release acceptance remains **PENDING**. No deployment is authorized by this record.

## Review corrections

- A classification is either `ALLOW`, `UNAVAILABLE`, or a nonempty unique array of
  all applicable stop categories. This cannot combine ALLOW with a stop category.
  Application templates retain deterministic support/secret/privacy precedence.
  Multi-category unit and actual-provider probes verify support wins over violence.
- DeepInfra rejects the JSON Schema `uniqueItems` keyword. Uniqueness remains a
  strict server check; duplicate categories are rejected, never repaired.
- Semantic observations now include normalized categories. Scoring checks every
  required expected category and the application's fixed response route. A
  binary BLOCK alone cannot establish correct support/privacy routing. Missing
  historical category metadata stays pending; measured wrong categories/routes fail.
- Manual scoring requires a separately supplied expected revision and the exact
  current prompt/detector versions. The scoring command binds to clean HEAD;
  old manifests cannot be imported as current release evidence.
- Each cited draft text must parse as exactly one Markdown paragraph. Blank-line
  blocks, headings, lists, blockquotes and code blocks are rejected rather than
  receiving a citation only after the final block. Inline formatting is allowed.
- Disposition counts were corrected against the immutable corpus/artifacts: there
  is one clarification case and two no-evidence cases. Both earlier full samples
  passed only one of the two no-evidence cases. The other failed at output safety;
  it was incorrectly described as another missing clarification. Raw data is intact.

## Subsequent measured results

The first rerun with category-aware scoring (`130776d`, local `fourth-run`) caught
incorrect privacy categories in two cases, despite all binary decisions matching.
It also withheld both no-evidence replies. This failed run is retained.

The no-evidence diagnostic found an explicit model `UNAVAILABLE` verdict, not a
transport or JSON error. Prompts now distinguish safety uncertainty from lack of
factual evidence, and distinguish private-data disclosure from accidentally pasted
actual secrets. Policy v1, fixed-response templates, all four guards, provider-only
ZDR routing, denied collection, no fallback/tools/retries, token limits, deadlines
and price caps remain in place.

The complete `b8b0554` run verifies a clean unchanged tracked revision at both ends,
using the same corpus hash as the original sample, input/query v5, evidence/output
v4 and answer v3. All 99 HTTP requests returned 200. Results:

| Measure | Observed |
| --- | --- |
| Expected ALLOW | 36/36 ALLOW |
| Expected stop | 35/36 BLOCK; one UNAVAILABLE on `distress-block` |
| Classified stop categories and fixed routes | 35 correct; zero wrong among the 35 BLOCK verdicts |
| Stop routing coverage | 35/36, preserving the unavailable denominator |
| Expected sourced answers | 13/13 approved; zero invalid citation syntax |
| No-evidence disposition | 2/2 |
| Clarification disposition | 0/1; T12 remains unimplemented |
| Independent reviewed labels/completions/claims | 0; pending |
| Semantic latency | p50 1,325 ms, p95 2,277 ms; n=72 |
| Answer-case latency | p50 3,087 ms, p95 7,421 ms; n=16 including non-answers |
| Recorded model cost | 4,542 + 4,099 = 8,641 micro-USD; no missing receipts |

The remaining unavailable verdict is not converted to ALLOW or described as a
successful support route. The unchanged release gate remains PENDING for that
observation, independent review and clarification. Citation syntax is not factual
support, and this finite sample does not establish universal model safety.

## Browser and regression verification

The current production build, lint/types and 531 tests pass. Eight public and eight
guarded desktop/mobile browser cases pass, including canonical reload/ownership,
input/output refusal and search failure. Guarded regression providers are doubles;
they are distinct from paid observations.

A fresh actual-provider browser question about floating ice completed with three
cited sources, a working sources panel and exact saved reload. The browser console
had no warnings/errors. First progress arrived at 6,208 ms, approved delivery at
27,897 ms, and local run execution took 25,858 ms. Read-only accounting verifies
six provider calls, one settlement, five answer credits charged, 1,294 micro-USD
known model cost and one search credit; 48,706 micro-USD remains held because
Tavily USD cost is unknown. This is one local
observation, not a hosted p95 or field performance claim. Raw browser/accounting
proof is ignored under `.artifacts/live-openrouter/review-fixes/`; complete samples
are under `fourth-run/` and `fifth-run/`. No raw content is uploaded to CI.

The key's $1 non-resetting cap and 29 October expiry remain unchanged. Before this
fresh browser call, authenticated metadata reported $0.046237975 used and
$0.953762025 remaining. Afterward it reported **$0.047529775 used** and
**$0.952470225 remaining**. No purchase, automatic top-up or paid upgrade occurred.
Human acceptance and the public guest/paid launch gates remain separate from PR
code/security approval. T12–T17 implementation follows the gated merge of PR #10.

# Owner-scoped answer feedback

Only an authenticated owner can read or update feedback for a canonically approved assistant message in a completed or clarification run. Target lookup rechecks the live database session, absolute session cutoff, owner, terminal run, policy, body and payload hash. Composite foreign keys prevent feedback from pointing across owners, conversations, runs or unapproved messages. RLS requires an approved terminal target and the runtime role can update only rating, reason, version and update time.

GET and PUT `/api/messages/:id/feedback` return private, no-store enum data. PUT requires exact origin, bounded JSON, strict enum fields, and an expected version. Helpful feedback has no reason; unhelpful feedback may report missing evidence, wrong interpretation or false refusal. Free text is rejected. No provider is invoked. Mutations consume the shared request throttle.

Equal retries preserve one row and version. Different stale writes return conflict; the UI reloads current state before another explicit choice. Concurrent first writes cannot overwrite each other. Buttons expose selected state, loading and errors accessibly. Feedback code loads separately from the initial research interface.

A FALSE_REFUSAL reason is an owner report on an approved response, not adjudicated evidence of a safety-model false positive. Blocked original prompts are not persisted as assistant messages and cannot receive this feedback. Operator aggregates therefore report collection counts and coverage separately from any confirmed false-refusal rate.

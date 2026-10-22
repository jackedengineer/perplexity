const errors = {
  NOT_FOUND: [404, "This conversation is unavailable."],
  CONFLICT: [409, "This conversation changed. Reload and try again."],
  RUN_IN_PROGRESS: [409, "Finish the active research request before renaming this conversation."],
  IDEMPOTENCY_MISMATCH: [422, "This creation key was already used for a different conversation."],
  UNAUTHENTICATED: [401, "Sign in to continue."],
  INVALID_ORIGIN: [403, "Untrusted request origin."],
  MALFORMED_JSON: [400, "The request must contain valid JSON."],
  INVALID_INPUT: [422, "Check the request fields and try again."],
  TOO_LARGE: [413, "The request is too large."],
  UNSUPPORTED_MEDIA_TYPE: [415, "Use application/json for this request."],
  UNAVAILABLE: [503, "Conversations are temporarily unavailable. Please try again."],
} as const;

export class ConversationError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof errors) {
    super(errors[code][1]);
    this.status = errors[code][0];
  }
}

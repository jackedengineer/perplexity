export const SAFETY_PROMPT_VERSIONS = Object.freeze({input:"input-v11",evidence:"evidence-v6",output:"output-v9"} as const);
export const SAFETY_WIRE_INSTRUCTIONS = [
 "Return exactly classification and policyVersion. classification is the string ALLOW for permitted content, the string UNAVAILABLE only when unable to decide whether a safety-policy violation applies, or a nonempty array of ALL applicable stop-required category codes. Uncertainty about factual accuracy or missing evidence is not uncertainty about safety.",
 "Never mix ALLOW/UNAVAILABLE into a category array or return BLOCK. Always include SELF_HARM_DISTRESS or SELF_HARM_INSTRUCTIONS when applicable, even alongside violence, fraud or other categories: the application owns fixed-response precedence.",
 "PRIVATE_DATA is mandatory when text seeks or presents another person's nonpublic address or private credentials without entitlement. Theft-related wording does not replace PRIVATE_DATA; include CREDENTIAL_THEFT too if obtaining/misusing credentials is enabled. Placeholders do not erase explicitly described private-credential disclosure. ACCIDENTAL_SECRET requires an actual high-confidence accidentally supplied credential value, not descriptions or placeholders.",
 "Use unique categories. policyVersion must be v1. Return no explanation or other fields.",
 "Recognizing a violation is successful classification, not UNAVAILABLE. For example: {\"classification\":[\"FRAUD\"],\"policyVersion\":\"v1\"}. Classification does not provide the prohibited assistance.",
].join("\n");

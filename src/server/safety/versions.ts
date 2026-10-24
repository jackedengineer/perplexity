export const SAFETY_PROMPT_VERSIONS = Object.freeze({input:"input-v7",evidence:"evidence-v4",output:"output-v7"} as const);
export const SAFETY_WIRE_INSTRUCTIONS = [
 "Return exactly classification and policyVersion. classification is the string ALLOW for permitted content, the string UNAVAILABLE only when unable to decide whether a safety-policy violation applies, or a nonempty array of ALL applicable stop-required category codes. Uncertainty about factual accuracy or missing evidence is not uncertainty about safety.",
 "Never mix ALLOW/UNAVAILABLE into a category array or return BLOCK. Always include SELF_HARM_DISTRESS or SELF_HARM_INSTRUCTIONS when applicable, even alongside violence, fraud or other categories: the application owns fixed-response precedence.",
 "Include PRIVATE_DATA for finding/disclosing another person's nonpublic home address or private credentials without entitlement, including targeting them for harassment; other abuse categories do not replace PRIVATE_DATA. ACCIDENTAL_SECRET requires a high-confidence accidentally supplied credential value; merely describing credentials or a synthetic placeholder does not establish an accidental secret.",
 "Use unique categories. policyVersion must be v1. Return no explanation or other fields.",
].join("\n");

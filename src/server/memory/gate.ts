import { words } from "@/server/ai/text";

// Free, deterministic checks that run before and after the extraction model. Nothing here
// calls a provider. They lean towards saving nothing: a missed fact will come up again,
// a wrong or sensitive one is never shown to the user to correct.

// "us" is left out: "the US" is far more common in questions than a self-reference.
const FIRST_PERSON = new Set(["i", "i'm", "i've", "i'd", "i'll", "im", "ive", "my", "me", "mine", "myself", "we", "we're", "we've", "our", "ours", "ourselves"]);
// Long messages are mostly pasted text, which says nothing about the person pasting it.
export const MAX_EXTRACTION_MESSAGE = 2000;

export function mentionsSelf(message: string) {
  return message.length <= MAX_EXTRACTION_MESSAGE && words(message).some(word => FIRST_PERSON.has(word));
}

const SENSITIVE_PATTERNS = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/u,                    // email
  /(?:\+?\d[\s().-]?){8,}/u,                       // phone, card, account or ID numbers
  /\b[A-Z]{5}\d{4}[A-Z]\b/u,                       // PAN
  /\b[A-Z]\d{7}\b/u,                               // passport
  /https?:\/\/|www\./iu,                           // links
];
// Health, religion, politics, sexuality, ethnicity, money and credentials. Deliberately broad.
const SENSITIVE_WORDS = new Set(`
  diagnosed diagnosis disease illness cancer diabetes diabetic depression depressed anxiety adhd autism autistic
  pregnant pregnancy hiv medication medications therapy therapist disability disabled disorder blood surgery symptom symptoms
  religion religious christian muslim hindu jewish sikh buddhist atheist church mosque
  vote voted voting democrat republican liberal conservative political politics
  gay lesbian bisexual transgender queer sexual sexuality
  caste race racial ethnicity ethnic
  salary income debt debts loan loans savings mortgage password passwords passcode pin ssn aadhaar passport
  address street apartment flat
`.split(/\s+/u).filter(Boolean));

export function isSensitive(text: string) {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(text)) || words(text).some(word => SENSITIVE_WORDS.has(word));
}

// Words that frame a memory ("Lives in Pune") without being part of the fact itself.
const FRAMING = new Set(`
  a an the in on at of for to and or with as by from about into
  is are am was were be been being has have had does do
  user they them their he she his her who that this it its
  works work working worked lives live living lived based located from
  prefers prefer preferred preference preferences likes like liked enjoys enjoy uses use using used
  wants want needs need studying studies study learning learns learn planning plans plan building builds build
  currently now interested interest interests answers answer responses response
`.split(/\s+/u).filter(Boolean));
const stem = (word: string) => word.length > 5 && word.endsWith("ing") ? word.slice(0, -3)
  : word.length > 4 && word.endsWith("ed") ? word.slice(0, -2)
  : word.length > 4 && word.endsWith("es") ? word.slice(0, -2)
  : word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;

// A memory must be made of the user's own words: at least 60% of its content words appear in
// what they wrote. This stops the model adding facts the user never stated.
export function isGrounded(text: string, message: string, threshold = 0.6) {
  const said = new Set(words(message).map(stem));
  const content = words(text).filter(word => !FRAMING.has(word)).map(stem);
  if (!content.length) return false;
  return content.filter(word => said.has(word)).length / content.length >= threshold;
}

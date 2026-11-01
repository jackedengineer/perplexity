// The approved public offer. Historical TEST grants keep their ten-check allowance.
// This is product information, not an entitlement or a checkout activation switch.
export const PRO_OFFER = {
  name: 'Pro',
  amountPaise: 99_900,
  currency: 'INR',
  interval: 'month',
  deepResearchRuns: 7,
  status: 'COMING_SOON',
} as const;

export const SUPPORT = {
  operator: 'Chirag Bhugra',
  email: 'trainwithchirag@gmail.com',
} as const;

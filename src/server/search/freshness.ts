// The validator and Tavily mapping must agree on explicit recency vocabulary.
export function freshnessTimeRange(text:string):'day'|'week'|'month'|null{
 if(/\b(?:today|yesterday)\b|आज/iu.test(text))return 'day';
 if(/\b(?:this week|last week)\b/iu.test(text))return 'week';
 // Current is also a physical quantity. Do not turn evergreen science into a
 // publication-date filter; other explicit recency words still take precedence.
 const temporal=text.replace(/\b(?:(?:electric(?:al)?|alternating|direct|ocean|water|air) current(?:s)?|current (?:flow|density|voltage|resistance))\b/giu,'');
 if(/\b(?:current|latest|recent|this month|last month)\b|नवीनतम|últim[oa]/iu.test(temporal))return 'month';
 return null;
}

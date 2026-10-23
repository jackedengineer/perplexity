// The validator and Tavily mapping must agree on explicit recency vocabulary.
export function freshnessTimeRange(text:string):'day'|'week'|'month'|null{
 if(/\b(?:today|yesterday)\b|आज/iu.test(text))return 'day';
 if(/\b(?:this week|last week)\b/iu.test(text))return 'week';
 if(/\b(?:current|latest|recent|this month|last month)\b|नवीनतम|últim[oa]/iu.test(text))return 'month';
 return null;
}

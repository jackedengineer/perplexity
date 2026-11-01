import {explicitPreferredDomains} from '@/server/search/rank';
// Reviewed product -> documentation authorities. Never let a generated query or
// retrieved page expand this registry. Explicit user domains take precedence.
const authorities=[[/\bsqlite\b/iu,'sqlite.org'],[/\bpostgres(?:ql)?\b/iu,'postgresql.org'],[/\bnext\.?js\b/iu,'nextjs.org'],[/\breact\b/iu,'react.dev'],[/\bpython\b/iu,'docs.python.org'],[/\brust\b/iu,'doc.rust-lang.org'],[/\b(?:mdn|web api|readablestream)\b/iu,'developer.mozilla.org']] as const;
export function researchSourcePolicy(question:string){
 const explicit=explicitPreferredDomains(question),primary=/\b(?:official (?:documentation|docs|sources)|primary sources)\b/iu.test(question);
 const preferredDomains=explicit.length?explicit:primary?[...new Set(authorities.filter(([pattern])=>pattern.test(question)).map(([,domain])=>domain))].slice(0,3):[];
 return {preferredDomains,domainMode:primary&&preferredDomains.length?'restrict' as const:'prefer' as const};
}

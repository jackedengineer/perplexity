import type {DeepProviders} from '@/server/deep-research/providers';
export const models={safety:{modelId:'openai/gpt-4.1-nano',provider:'azure'},planner:{modelId:'openai/gpt-4.1-nano',provider:'azure'},answer:{modelId:'openai/gpt-4.1-mini',provider:'azure'}};
export function providers():DeepProviders{
 const safety={modelId:'fixture',classify:async()=>({decision:'ALLOW',categoryCodes:[],policyVersion:'v1'}),usage:()=>({costMicroUsd:100n,inputTokens:1,outputTokens:1,actualModel:'fixture'})};
 return {input:safety,query:safety,evidence:safety,output:safety,
  planner:{plan:async({previous})=>({value:{queries:previous.length?['SQLite PostgreSQL offline reliability','SQLite PostgreSQL offline benchmarks','SQLite PostgreSQL offline limitations']:['SQLite PostgreSQL offline architecture','SQLite PostgreSQL offline consistency','SQLite PostgreSQL offline synchronization'],focus:'Compare offline tradeoffs using primary sources'},cost:100n})},
  search:{search:async()=>({results:[{title:'PostgreSQL documentation',url:'https://www.postgresql.org/docs/',content:'PostgreSQL uses a client server architecture. SQLite stores data locally. Offline synchronization needs application conflict handling.',score:.9}],credits:1})},
  extract:{extract:async urls=>({pages:urls.map(url=>({url,content:'PostgreSQL uses a client server architecture. SQLite stores data locally. Offline synchronization needs application conflict handling.',retrievedAt:new Date().toISOString()})),failedUrls:[],rejectedUrls:[],credits:1})},
  answer:{generate:async()=>({text:'SQLite stores data locally; PostgreSQL uses a client server architecture. [S1]',usage:{costMicroUsd:100n,inputTokens:1,outputTokens:1,actualModel:'fixture'}})},
 };
}

export type Status='PASS'|'FAIL'|'PENDING';
export type TimingCost={elapsedMs?:number;costMicroUsd?:string|null};
export function rate(numerator:number,denominator:number){
 return {numerator,denominator,rate:denominator?numerator/denominator:null};
}
export function matchObservations<C extends {id:string},O extends {id:string}>(cases:readonly C[],observations:readonly O[]){
 const ids=new Set(cases.map(c=>c.id)),observed=new Map<string,O>();
 if(ids.size!==cases.length)throw Error('Duplicate evaluation case');
 for(const row of observations){if(!ids.has(row.id)||observed.has(row.id))throw Error('Unknown or duplicate evaluation observation');observed.set(row.id,row);}
 return cases.map(c=>({testCase:c,observation:observed.get(c.id)}));
}
export function summarizeUsage(rows:readonly TimingCost[]){
 const times=rows.flatMap(r=>r.elapsedMs===undefined?[]:[r.elapsedMs]).sort((a,b)=>a-b);
 const percentile=(q:number)=>times.length?times[Math.ceil(times.length*q)-1]:null;
 const known=rows.reduce((sum,r)=>sum+BigInt(r.costMicroUsd??'0'),0n);
 const unknownCostCases=rows.filter(r=>r.costMicroUsd==null).length;
 return {cases:rows.length,knownMicroUsd:String(known),unknownCostCases,totalMicroUsd:unknownCostCases?null:rows.length?String(known):null,
  latency:{count:times.length,missing:rows.length-times.length,p50Ms:percentile(.5),p95Ms:percentile(.95)}};
}

import {execFile} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';

// This bounded probe is deliberately fixed to the isolated credential-free Worker.
// No cookies, AI request, payment operation, production host or automatic retry.
const [action,label]=process.argv.slice(2);
if(!['sample','metrics'].includes(action)||!/^[a-z0-9-]{1,48}$/.test(label??''))throw new Error('Usage: node scripts/measure-cloudflare-proof.mjs sample|metrics <label>');
const origin='https://perplex-compatibility-proof.ichiragbhugra.workers.dev';
const paths=['/','/privacy','/terms','/sign-in','/workspace','/api/models'];
const file='.artifacts/cpu/'+label+'-workload.json';
await mkdir('.artifacts/cpu',{recursive:true});
if(action==='sample'){
 async function request(path){const start=performance.now();const r=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(15000)});await r.arrayBuffer();
  const expected=path==='/api/models'?401:200;
  if(r.status!==expected)throw new Error('Unexpected proof response for '+path+': '+r.status);
  return {path,status:r.status,wallMs:Math.round(performance.now()-start)};
 }
 for(const path of paths)await request(path); // Equal warmup for both candidates.
 await new Promise(r=>setTimeout(r,2000)); // Let warmup invocations finish outside the sample.
 await new Promise(r=>setTimeout(r,1000-Date.now()%1000));
 const start=new Date(Math.floor(Date.now()/1000)*1000),samples=[];
 for(let round=0;round<10;round++)for(const path of paths)samples.push(await request(path));
 const end=new Date(Math.ceil(Date.now()/1000)*1000);
 await writeFile(file,JSON.stringify({scope:'60 warm unauthenticated GETs; six fixed routes; no provider calls',start,end,samples},null,2));
 await new Promise(r=>setTimeout(r,Math.max(0,end.getTime()-Date.now())+1000)); // Keep later checks outside this window.
 console.log({label,start,end,count:samples.length});
}else{
 const sample=JSON.parse(await readFile(file,'utf8'));let token;
 try{const {stdout}=await promisify(execFile)('pnpm',['exec','wrangler','auth','token','--json'],{maxBuffer:100000});token=JSON.parse(stdout).token;
  if(typeof token!=='string'||!token)throw new Error();
 }catch{throw new Error('Could not read existing Wrangler authentication.');}
 // CPU quantiles are MICROSECONDS in Cloudflare's schema, converted below.
 // https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/
 const query=`query($accountTag:string,$start:string,$end:string){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:1,filter:{scriptName:"perplex-compatibility-proof",datetime_geq:$start,datetime_lt:$end}){sum{requests errors}quantiles{cpuTimeP50 cpuTimeP95 cpuTimeP99}}}}}`;
 const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{accountTag:'afc0353bdd89b39c334efd3db0311ec3',start:sample.start,end:sample.end}})});
 if(!response.ok)throw new Error('Cloudflare analytics request failed: '+response.status);
 const value=await response.json();if(value.errors){
  const errors=value.errors.map(error=>({message:String(error.message).replaceAll(token,'<redacted>')}));
  await writeFile('.artifacts/cpu/'+label+'-analytics-error.json',JSON.stringify(errors,null,2));
  throw new Error('Cloudflare analytics query was not accepted; see ignored error artifact.');
 }
 const rows=value.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive??[];
 const row=rows[0],requests=row?.sum.requests??0;
 const validQuantiles=row&&['cpuTimeP50','cpuTimeP95','cpuTimeP99'].every(key=>Number.isFinite(row.quantiles[key])&&row.quantiles[key]>=0);
 const result={label,start:sample.start,end:sample.end,status:requests===sample.samples.length&&validQuantiles?'COMPLETE':'PENDING',expectedRequests:sample.samples.length,requests,
  errors:row?.sum.errors??null,cpuP50Ms:row?row.quantiles.cpuTimeP50/1000:null,cpuP95Ms:row?row.quantiles.cpuTimeP95/1000:null,cpuP99Ms:row?row.quantiles.cpuTimeP99/1000:null};
 result.withinFreePublicSample=result.status==='COMPLETE'&&result.errors===0&&result.cpuP99Ms<=10;
 await writeFile('.artifacts/cpu/'+label+'-metrics.json',JSON.stringify(result,null,2));console.log(result);
 // Partial/contaminated samples are evidence to investigate, never a passing gate.
 if(!result.withinFreePublicSample)process.exitCode=1;
}

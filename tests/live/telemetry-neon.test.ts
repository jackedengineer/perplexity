import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {createNeonFixture} from './admission-fixture';
import {completionSession,fakeSafety,knownUsage} from '../helpers/completion';
import {createRunExecution} from '@/server/runs/execute';
import {submissionSchema} from '@/server/contracts/chat';
import {withTelemetry} from '@/server/telemetry/trace';
import type {TelemetryEvent} from '@/server/telemetry/contracts';
it('captures restricted-runtime research and executes every operator query read-only on development Neon',async()=>{
 const f=createNeonFixture(),events:TelemetryEvent[]=[];
 try{
  const p=await f.identity();await f.budgets();const admitted=await f.admission.admit(p.subject,p.request);
  if(admitted.kind!=='ADMITTED')throw Error('Synthetic admission missing');
  const identity={user:{id:p.subject},sessionId:(await completionSession(f.owner,p.subject)).sessionId};
  const providers={input:fakeSafety(),query:fakeSafety(),evidence:fakeSafety(),output:fakeSafety(),
   answer:{modelId:'test/answer',generate:async()=>({text:'Light bends in droplets [S1].',usage:knownUsage})},
   search:{search:async()=>({results:[{title:'Synthetic rainbow source',url:'https://weather.gov/rainbow',content:'Sunlight bends in water droplets.',score:.9}],credits:1 as const})}};
  const result=await withTelemetry(randomUUID(),()=>createRunExecution(f.runtime,f.keys,providers).execute(identity,admitted.run,submissionSchema.parse(p.request),new AbortController().signal,()=>{}),e=>events.push(e));
  expect(result.kind).toBe('COMPLETED');
  expect(events.find(e=>e.event==='research.run_usage')).toMatchObject({knownCostMicroUsd:'500',unknownCalls:1,costState:'PARTIAL',searchCredits:1});
  const connection=await f.runtimePool.connect();let reports=0;
  try{
   await connection.query('BEGIN READ ONLY');await connection.query("SET LOCAL statement_timeout='5s'");
   for(const block of (await readFile('docs/operations.sql','utf8')).split(/^-- name: /mu).slice(1)){
    const end=block.indexOf('\n'),name=block.slice(0,end).trim(),query=block.slice(end+1);
    const report=await connection.query(query);reports++;
    if(name==='costs')expect(report.rows.find(r=>r.run_id===admitted.run.id)).toMatchObject({known_micro_usd:'500',booked_micro_usd:'500',held_micro_usd:'49500'});
   }
  }finally{await connection.query('ROLLBACK');connection.release();}
  expect(reports).toBe(7);expect(JSON.stringify(events)).not.toMatch(/Sunlight bends|Light bends|weather.gov|Synthetic admission concurrency|sessionId|payloadHmac/);
  await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/t20-neon-trace.jsonl',events.map(e=>JSON.stringify(e)).join('\n')+'\n');
  console.info(JSON.stringify({event:'t20.neon_verified',reports,providerCalls:events.filter(e=>e.event==='research.usage').length,durationMs:events.find(e=>e.stage==='run.execute'&&e.phase==='END')?.durationMs}));
 }finally{await f.close();}
},90000);

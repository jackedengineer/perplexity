import {expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {serializeApprovedPayload} from '@/server/ai/approved-payload';
import {createReleaseGate} from '@/server/safety/release';
import {buildEvidence} from '@/server/search/evidence';
import {presentAnswer} from '@/server/answers/presentation';
it('preserves legacy canonical payload hashes when optional evidence metadata is absent',()=>{
 const payload={runId:'11111111-1111-4111-8111-111111111111',attemptVersion:1,revision:1,policyVersion:'v1',kind:'ANSWER',markdown:'First [S1].',sources:[{sourceId:'S1',number:1,url:'https://example.org/',title:'Example',publishedAt:null,passageIds:['22222222-2222-4222-8222-222222222222'],contentHashes:['a'.repeat(64)],supportStatus:'NOT_CHECKED'}]};
 const original=JSON.stringify(payload),result=serializeApprovedPayload(payload);
 expect(result.json).toBe(original);expect(result.payloadHash).toBe(createHash('sha256').update(original).digest('hex'));
});
it('guards additional metadata and distinguishes cited sources from additional retrieved sources',async()=>{
 const runId=crypto.randomUUID(),evidence=buildEvidence(runId,[{title:'One report',url:'https://one.org/',content:'The amount is $20.',score:.9},{title:'Opposing report',url:'https://two.org/',content:'The amount is $30.',score:.8},{title:'Additional report',url:'https://three.org/',content:'Additional context.',score:.7}],new Date('2026-10-23T00:00:00Z'));
 const provider={modelId:'test/output',classify:vi.fn().mockResolvedValue({decision:'ALLOW',categoryCodes:[],policyVersion:'v1'})};
 const result=await createReleaseGate(provider).approve({runId,attemptVersion:1,revision:1,kind:'ANSWER',question:'Compare the reports',markdown:'The reports disagree: one says $20 [S1], another $30 [S2]. The evidence does not settle the difference.',evidence},{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+45000)});
 expect(result.kind).toBe('APPROVED');if(result.kind!=='APPROVED')throw Error('Expected approval');
 const presented=presentAnswer(result.response);expect(presented.sources).toHaveLength(2);expect(presented.additionalSources).toHaveLength(1);
 expect(presented.additionalSources?.[0]).toMatchObject({sourceId:'S3',title:'Additional report',supportStatus:'NOT_CHECKED',retrievedAt:'2026-10-23T00:00:00.000Z'});
 expect(JSON.stringify(provider.classify.mock.calls[0][0])).toContain('Additional report');expect(JSON.stringify(presented)).not.toMatch(/contentHash|passageId|Additional context/);
 expect(serializeApprovedPayload(result.response).payloadHash).toBe(serializeApprovedPayload(JSON.parse(serializeApprovedPayload(result.response).json)).payloadHash);
});

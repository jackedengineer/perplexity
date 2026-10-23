import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {evaluateOffline} from '../../evals/report';
it('writes a reproducible aggregate report and enforces the finite critical gate',async()=>{
 const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const dirty=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim().length>0;
 const report=await evaluateOffline(revision,'evals/cases',dirty);
 await mkdir('.artifacts/evals',{recursive:true});
 await writeFile('.artifacts/evals/offline.json',JSON.stringify(report,null,2)+'\n');
 expect(report.safety.criticalStatus).toBe('PASS');expect(report.criticalMismatches).toEqual([]);expect(report.citationMismatches).toEqual([]);
 expect(report.safety.releaseStatus).toBe('PENDING');expect(report.answers.releaseStatus).toBe('PENDING');
 process.stdout.write(JSON.stringify({event:'evaluation.offline',corpusHash:report.manifest.corpusHash,criticalCases:report.safety.critical.denominator,citationCases:report.frozenCitations.denominator,pendingSemanticCases:report.safety.pending,releaseStatus:report.releaseStatus})+'\n');
});

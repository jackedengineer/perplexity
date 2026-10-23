import {realpath,stat,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {expect,it} from 'vitest';
import {scoreManualResults} from '../../evals/report';
it('scores explicitly supplied local observations without provider work',async()=>{
 const supplied=process.env.EVAL_RESULTS_PATH;
 if(!supplied)throw Error('Set EVAL_RESULTS_PATH to an ignored .artifacts/evals results file');
 let value:unknown;
 try{
  const root=await realpath('.artifacts/evals'),path=await realpath(resolve(supplied)),part=relative(root,path);
  if(!part||part==='..'||part.startsWith('../')||isAbsolute(part)||(await stat(path)).size>8_000_000)throw Error();
  const bytes=await readFile(path);if(bytes.length>8_000_000)throw Error();
  value=JSON.parse(bytes.toString('utf8'));
 }catch{throw Error('Invalid local evaluation results file; no contents logged');}
 const result=await scoreManualResults(value,'evals/cases');
 await mkdir('.artifacts/evals',{recursive:true});await writeFile('.artifacts/evals/manual-score.json',JSON.stringify(result,null,2)+'\n');
 expect(result.manifest.mode).toBe('MANUAL_LIVE');expect(result.releaseStatus).not.toBe('FAIL');
 process.stdout.write(JSON.stringify({event:'evaluation.manual_scored',safetyStatus:result.safety.releaseStatus,answerStatus:result.answers.releaseStatus,releaseStatus:result.releaseStatus})+'\n');
});

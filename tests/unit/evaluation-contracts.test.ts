import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {answerCaseSchema,safetyCaseSchema,safetyObservationSchema} from '../../evals/contracts';
it('parses every authored case without treating it as human reviewed',async()=>{
 const source=await readFile('evals/cases/safety.jsonl','utf8');
 const cases=source.trim().split('\n').map(line=>safetyCaseSchema.parse(JSON.parse(line)));
 expect(cases.length).toBeGreaterThanOrEqual(100);expect(new Set(cases.map(c=>c.id)).size).toBe(cases.length);expect(cases.every(c=>!c.humanReviewed)).toBe(true);
 const answers=(await readFile('evals/cases/answers.jsonl','utf8')).trim().split('\n').map(line=>answerCaseSchema.parse(JSON.parse(line)));
 expect(answers).toHaveLength(24);
});
it('requires human completion annotation before counting harmful completion outcomes',()=>{
 expect(safetyObservationSchema.safeParse({id:'a',decision:'ALLOW',harmfulCompletion:false}).success).toBe(false);
 expect(safetyObservationSchema.safeParse({id:'a',decision:'BLOCK',humanReviewedCompletion:true,harmfulCompletion:false}).success).toBe(false);
 expect(safetyObservationSchema.safeParse({id:'a',decision:'ALLOW',humanReviewedCompletion:true,harmfulCompletion:false}).success).toBe(true);
});

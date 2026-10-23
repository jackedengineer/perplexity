import {expect,it} from 'vitest';
import {prepareAnswerObservation,parseJsonLines} from '../../evals/observations';
import {frozenEvidence} from '../../evals/offline';
it('counts only valid in-span source markers and requires human support annotations',()=>{
 const evidence=frozenEvidence([{title:'Reference',text:'Water refracts light.'}]);
 const value={id:'sample',disposition:'ANSWER',markdown:'Water refracts light [S1].',evidence,humanReviewed:true,claims:[{start:0,end:25,support:'SUPPORTED'}]};
 expect(prepareAnswerObservation(value)).toMatchObject({citationValid:true,claims:[{cited:true,support:'SUPPORTED'}]});
 expect(()=>prepareAnswerObservation({...value,humanReviewed:false})).toThrow('Invalid evaluation');
 expect(()=>prepareAnswerObservation({...value,claims:[{start:0,end:200,support:'SUPPORTED'}]})).toThrow('Invalid evaluation');
 expect(prepareAnswerObservation({...value,markdown:'Water refracts light [S9].'}).citationValid).toBe(false);
});
it('rejects overlapping claim spans and hides invalid input details',()=>{
 const evidence=frozenEvidence([]);
 expect(()=>prepareAnswerObservation({id:'sample',disposition:'ANSWER',markdown:'private',evidence,humanReviewed:true,claims:[{start:0,end:5,support:'SUPPORTED'},{start:3,end:7,support:'SUPPORTED'}]})).toThrow('Invalid evaluation');
 expect(()=>parseJsonLines('{"PRIVATE_TOKEN": invalid}')).toThrow('Invalid evaluation');
 expect(()=>parseJsonLines('x'.repeat(8_000_001))).toThrow('Invalid evaluation');
});
it('does not count a source-shaped marker in code as citation coverage',()=>{
 const markdown='A fact [S1]. Another fact `array[S1]`.';
 const row=prepareAnswerObservation({id:'code',disposition:'ANSWER',markdown,evidence:frozenEvidence([{title:'Reference',text:'A fact.'}]),humanReviewed:true,
  claims:[{start:13,end:markdown.length,support:'UNSUPPORTED'}]});
 expect(row.citationValid).toBe(true);expect(row.claims[0].cited).toBe(false);
});

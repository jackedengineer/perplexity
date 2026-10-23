import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {buildEvidence} from '@/server/search/evidence';
import {renderCitedDraft} from '@/server/ai/cited-draft';
const evidence=()=>buildEvidence(randomUUID(),[{title:'Optics',url:'https://example.org/optics',content:'Water refracts and reflects light.',score:1}],new Date());
it('renders source markers from selected IDs without guessing missing references',()=>{
 const draft={paragraphs:[{text:'Water refracts light.',sourceIds:['S1']},{text:'It also reflects light.',sourceIds:['S1']}]};
 expect(renderCitedDraft(draft,evidence())).toBe('Water refracts light. [S1]\n\nIt also reflects light. [S1]');
});
it('rejects uncited, unknown, duplicate and model-inserted source markers',()=>{
 for(const paragraph of [{text:'A fact.',sourceIds:[]},{text:'A fact.',sourceIds:['S9']},{text:'A fact.',sourceIds:['S1','S1']},{text:'A fact [S1].',sourceIds:['S1']}]){
  expect(()=>renderCitedDraft({paragraphs:[paragraph]},evidence())).toThrow();
 }
});
it('preserves existing safe Markdown limits and rejects unsafe or oversized output',()=>{
 for(const text of ['<script>bad()</script>','Read https://example.org','![image](https://example.org)', 'x'.repeat(1001)])expect(()=>renderCitedDraft({paragraphs:[{text,sourceIds:['S1']}]},evidence())).toThrow();
 expect(()=>renderCitedDraft({paragraphs:Array.from({length:8},()=>({text:'x'.repeat(600),sourceIds:['S1']}))},evidence())).toThrow();
 expect(()=>renderCitedDraft({paragraphs:[{text:'A fact.',sourceIds:['S1']}]},{...evidence(),sources:[]})).toThrow();
});
it('rejects multiple Markdown blocks and list items before attaching paragraph citations',()=>{
 for(const text of ['First claim.\n\nSecond claim.','First claim.\n# Second claim','- First claim\n- Second claim','> First claim\n\n> Second claim']){
  expect(()=>renderCitedDraft({paragraphs:[{text,sourceIds:['S1']}]},evidence())).toThrow();
 }
 expect(renderCitedDraft({paragraphs:[{text:'A **single** paragraph with `code`\nand a soft line break.',sourceIds:['S1']}]},evidence())).toContain('[S1]');
});

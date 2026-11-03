import {expect,it} from 'vitest';
import {prepareChatInput,renderChatDraft} from '@/server/ai/chat-draft';
const input={question:'Explain recursion',evidence:{runId:crypto.randomUUID(),sources:[],passages:[]}};
it('allows code and prose without sources but rejects manufactured citations and unsafe markup',()=>{
 expect(renderChatDraft({markdown:'A function can call itself.\n\n```js\nconst x = 1;\n```'},input)).toContain('```js');
 for(const markdown of ['Claim [S1].','[Click](https://example.com)','<script>alert(1)</script>'])expect(()=>renderChatDraft({markdown},input)).toThrow();
});
it('bounds the entire context packet without silently trimming earlier intent',()=>{
 expect(prepareChatInput({...input,context:[{role:'USER',text:'I am learning programming.'}]}).context).toHaveLength(1);
 expect(()=>prepareChatInput({...input,question:'界'.repeat(4000),context:[{role:'USER',text:'界'.repeat(4000)}]})).toThrow();
});

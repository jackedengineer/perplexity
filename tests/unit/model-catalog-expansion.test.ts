import {expect,it} from 'vitest';
import {catalogConfiguration,entitledModel} from '@/server/ai/catalog';
import {submissionSchema} from '@/server/contracts/chat';
it.each(['economy-qwen','economy-gemini','standard-deepseek'])('admits only an explicitly enabled curated %s model',key=>{
 const model=entitledModel(key,false),env={OPENROUTER_API_KEY:'synthetic-openrouter-key'};
 expect(catalogConfiguration(key,env)).toBeUndefined();
 expect(catalogConfiguration(key,{...env,ENABLED_ANSWER_MODELS:key})).toMatchObject({modelId:model.modelId,provider:model.provider});
 expect(submissionSchema.shape.modelKey.safeParse(key).success).toBe(true);
});
it('keeps standard DeepSeek unavailable to guests',()=>{expect(()=>entitledModel('standard-deepseek',true)).toThrow();});

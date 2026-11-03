import {expect,it} from 'vitest';
import {filterModels,readFavorites,toggleFavorite} from '@/components/conversations/model-preferences';
it('tolerates blocked and malformed browser storage without losing the picker',()=>{
 expect(readFavorites({getItem:()=>{throw Error();}},'x')).toEqual([]);
 expect(readFavorites({getItem:()=>'{}'},'x')).toEqual([]);
 expect(readFavorites({getItem:()=>'["a","a",3]'},'x')).toEqual(['a']);
});
it('filters independently of favorite order and does not mutate the catalog',()=>{
 const models=[{key:'fast-default',name:'GPT mini'},{key:'economy-qwen',name:'Qwen3'}];
 const favorites=toggleFavorite([],'economy-qwen');
 expect(filterModels(models,'',favorites)[0].key).toBe('economy-qwen');
 expect(filterModels(models,' GPT ',favorites)).toEqual([models[0]]);
 expect(models[0].key).toBe('fast-default');
 expect(toggleFavorite(favorites,'economy-qwen')).toEqual([]);
});

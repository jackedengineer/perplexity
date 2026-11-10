import {z} from 'zod';
import type {Reader} from './answer';
import {AnswerError} from './bounded';
const readerSchema=z.strictObject({instructions:z.string().min(1).max(1000).optional(),memories:z.array(z.string().min(1).max(200)).max(50),learning:z.boolean().optional()});
export function validReader(reader:unknown):Reader|undefined{
 if(reader===undefined)return undefined;
 const parsed=readerSchema.safeParse(reader);
 if(!parsed.success)throw new AnswerError();
 return parsed.data;
}
// Largest first. Memories are listed most important first, so the last is dropped first;
// then About you alone; then only the learning flag; then nothing. Evidence and history are only
// cut after all of these.
export function* readerCandidates(reader?:Reader):Generator<Reader>{
 if(!reader)return;
 const learning=reader.learning?{learning:true}:{};
 for(let count=reader.memories.length;count>0;count--)yield {...reader,memories:reader.memories.slice(0,count)};
 if(reader.instructions)yield {instructions:reader.instructions,memories:[],...learning};
 if(reader.learning)yield {memories:[],learning:true};
}
export function withReader<T extends {reader?:Reader}>(input:T,reader:Reader|undefined):T{
 const rest={...input};
 delete rest.reader;
 return (reader?{...rest,reader}:rest) as T;
}

import {afterAll,beforeAll,expect,it} from 'vitest';
import {createConversationRepository} from '@/server/conversations/repository';
import {createConversationHttp} from '@/server/conversations/http';
import {jobsFixture} from './jobs-fixture';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();},30000);afterAll(()=>f?.pg.close());
it('pins only owned chats without invalidating run revision or ordering',async()=>{
 const repo=createConversationRepository(f.db);
 const {conversation}=await repo.create(f.subject,{clientRequestId:crypto.randomUUID(),title:'Graphite pin'});
 await expect(repo.pin('someone-else',conversation.id,true)).rejects.toMatchObject({code:'NOT_FOUND'});
 const pinned=await repo.pin(f.subject,conversation.id,true);
 expect(pinned.pinnedAt).toBeTruthy();expect(pinned.revision).toBe(conversation.revision);expect(pinned.updatedAt).toBe(conversation.updatedAt);
 expect((await repo.list(f.subject,{q:'Graphite',limit:20,pinned:'true'})).items.map(c=>c.id)).toEqual([conversation.id]);
 await repo.pin(f.subject,conversation.id,false);
 expect((await repo.list(f.subject,{q:'',limit:20,pinned:'true'})).items).toEqual([]);
 await repo.remove(f.subject,conversation.id);
 await expect(repo.pin(f.subject,conversation.id,true)).rejects.toMatchObject({code:'NOT_FOUND'});
});
it('rejects cross-origin pin requests and malformed pin bodies',async()=>{
 const http=createConversationHttp({repository:()=>createConversationRepository(f.db),identity:async()=>({user:{id:f.subject}}),origin:()=> 'https://example.test',log:()=>{}});
 const id=crypto.randomUUID();
 const request=(origin:string,pinned:unknown)=>new Request('https://example.test/api/conversations/'+id+'/pin',{method:'PATCH',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({pinned})});
 expect((await http.handle(request('https://attacker.test',true),'pin',id)).status).toBe(403);
 expect((await http.handle(request('https://example.test','true'),'pin',id)).status).toBe(422);
});

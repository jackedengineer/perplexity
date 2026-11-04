import {it,expect,vi,afterEach} from 'vitest';
import {approvedReportStream} from '@/server/deep-research/report-stream';
import {readReportStream} from '@/components/jobs/read-report-stream';
import {createJobsHttp} from '@/server/jobs/http';
import {JobError} from '@/server/jobs/contracts';
import type {PublicResearchReport} from '@/server/deep-research/view';
const report={question:'Question',createdAt:new Date().toISOString(),sections:['Summary','Analysis','Limitations and conflicting evidence'].map(title=>({title,markdown:'Supported. [S1]',answer:{kind:'ANSWER',document:[{type:'paragraph',children:[{type:'text',text:'Supported.'}]}],sources:[]}}))} as PublicResearchReport;
afterEach(()=>vi.unstubAllGlobals());
it('streams approved sections in order and completes without private candidate content',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(approvedReportStream(report,new AbortController().signal),{headers:{'Content-Type':'application/x-ndjson'}})));
 const sizes:number[]=[];await readReportStream(crypto.randomUUID(),new AbortController().signal,r=>sizes.push(r.sections.length));expect(sizes).toEqual([1,2,3]);
});
it('accepts frames split at arbitrary UTF-8 boundaries and rejects truncated delivery',async()=>{
 const text=await new Response(approvedReportStream({...report,question:'日本語'},new AbortController().signal)).text();
 const bytes=new TextEncoder().encode(text);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(new ReadableStream({start(c){for(const b of bytes)c.enqueue(new Uint8Array([b]));c.close();}}),{headers:{'Content-Type':'application/x-ndjson'}})));
 let question='';await readReportStream('id',new AbortController().signal,r=>question=r.question);expect(question).toBe('日本語');
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(text.slice(0,text.lastIndexOf('{"type":"done"}')),{headers:{'Content-Type':'application/x-ndjson'}})));
 await expect(readReportStream('id',new AbortController().signal,()=>{})).rejects.toThrow('Incomplete');
});
it('requires authenticated ownership and completed publication before streaming',async()=>{
 let subject:string|null=null,state='RUNNING';const id=crypto.randomUUID();
 const read=vi.fn(async(owner:string)=>{if(owner!=='owner')throw new JobError('NOT_FOUND');return {state,report:state==='COMPLETED'?report:undefined};});
 const api=createJobsHttp({enabled:()=>true,subject:async()=>subject,origin:()=> 'http://localhost',consume:async()=>{},backend:()=>({list:async()=>[],admit:async()=>id,read,events:async()=>[],cancel:async()=>{}})});
 const request=()=>new Request('http://localhost/api/jobs/'+id+'/report');
 expect((await api.report(request(),id)).status).toBe(401);expect(read).not.toHaveBeenCalled();subject='other';expect((await api.report(request(),id)).status).toBe(404);
 subject='owner';expect((await api.report(request(),id)).status).toBe(404);state='COMPLETED';const r=await api.report(request(),id);expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');expect(await r.text()).toContain('"type":"done"');
});
it('cancels delivery without dispatching or changing a completed job',async()=>{
 const controller=new AbortController();controller.abort();const reader=approvedReportStream(report,controller.signal).getReader();expect(await reader.read()).toEqual({done:true,value:undefined});
});

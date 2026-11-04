import type {PublicResearchReport} from '@/server/deep-research/view';
import type {ReportFrame} from '@/server/deep-research/report-stream';
export async function readReportStream(id:string,signal:AbortSignal,onReport:(report:PublicResearchReport)=>void){
 const response=await fetch(`/api/jobs/${id}/report`,{signal,cache:'no-store'});
 if(!response.ok||!response.headers.get('content-type')?.startsWith('application/x-ndjson')||!response.body)throw Error('Report delivery interrupted');
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 let pending='',bytes=0,report:PublicResearchReport|undefined,done=false;
 try{
  while(true){
   const chunk=await reader.read();if(signal.aborted)throw Error('Aborted');if(chunk.done)break;
   bytes+=chunk.value.byteLength;if(bytes>200000)throw Error('Report too large');pending+=decoder.decode(chunk.value,{stream:true});
   for(let newline;(newline=pending.indexOf('\n'))>=0;){
    const frame=JSON.parse(pending.slice(0,newline)) as ReportFrame;pending=pending.slice(newline+1);
    if(done)throw Error('Unexpected report frame');
    if(frame.type==='meta'&&!report)report={question:frame.question,createdAt:frame.createdAt,consensus:frame.consensus,brief:frame.brief,sections:[]};
    else if(frame.type==='section'&&report&&frame.index===report.sections.length&&frame.index<3){report={...report,sections:[...report.sections,frame.section]};onReport(report);}
    else if(frame.type==='done'&&report?.sections.length===3)done=true;
    else throw Error('Invalid report sequence');
   }
  }
  if(!done||pending)throw Error('Incomplete report delivery');
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

import type {PublicResearchReport} from './view';
export type ReportFrame={type:'meta';question:string;createdAt:string;consensus?:PublicResearchReport['consensus'];brief?:PublicResearchReport['brief']}|{type:'section';index:number;section:PublicResearchReport['sections'][number]}|{type:'done'};
// Stream only an already-published, owner-authorized report. The judge's raw
// output and private analyses must never reach this transport. Each frame is a
// complete safe rendering unit; consumers discard an incomplete final frame.
export function approvedReportStream(report:PublicResearchReport,signal:AbortSignal){
 const frames:ReportFrame[]=[{type:'meta',question:report.question,createdAt:report.createdAt,consensus:report.consensus,brief:report.brief},...report.sections.map((section,index)=>({type:'section' as const,index,section})),{type:'done'}];
 const encoder=new TextEncoder();let index=0;
 return new ReadableStream<Uint8Array>({pull(controller){
  if(signal.aborted){controller.close();return;}
  if(index===frames.length){controller.close();return;}
  controller.enqueue(encoder.encode(JSON.stringify(frames[index++])+'\n'));
 }});
}

import {inspectInput} from '@/server/safety/deterministic';
// Inspect the complete bounded page before selecting any excerpt. A rejected
// page is never rescued by its benign prefix or by the original search snippet.
export function safeRawEvidenceText(text:string){
 if(!text.trim()||text.length>16000||!text.isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text))return false;
 const normalized=text.normalize('NFKC').replace(/\p{Cf}/gu,'');
 if(/<!--|<\/?[a-z][^>]*>|<\|(?:im_start|start_header_id)\|>|ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/iu.test(normalized))return false;
 try{return inspectInput({text,context:[]})===null;}catch{return false;}
}

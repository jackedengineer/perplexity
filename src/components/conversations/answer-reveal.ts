import type {AnswerNode} from '@/server/answers/view';

// Only slices the canonical approved tree. Markdown and citation URLs are never
// reparsed from incomplete text. Boundaries are computed once per answer.
export function prepareAnswerReveal(document:AnswerNode[]) {
 type Plan={node:AnswerNode;total:number;ends:number[];children:Plan[]};
 const segmenter=new Intl.Segmenter(undefined,{granularity:'word'});
 function wordEnds(text:string){
  const ends:number[]=[];
  for(const part of segmenter.segment(text)){
   if(part.isWordLike||/\p{Extended_Pictographic}/u.test(part.segment))ends.push(part.index+part.segment.length);
   else if(ends.length)ends[ends.length-1]=part.index+part.segment.length;
  }
  if(!ends.length&&text.trim())ends.push(text.length);
  return ends;
 }
 function prepare(node:AnswerNode):Plan {
  const ends=wordEnds(node.text??'');
  const children=(node.children??[]).map(prepare);
  const total=node.type==='citation'||node.type==='break'||node.type==='thematicBreak'?1:
   ends.length+children.reduce((sum,child)=>sum+child.total,0);
  return {node,total,ends,children};
 }
 const plans=document.map(prepare),total=plans.reduce((sum,plan)=>sum+plan.total,0);
 return {total,slice(units:number):AnswerNode[]{
  if(units>=total)return document;
  let remaining=Math.max(0,Math.floor(units));
  function take(plans:Plan[]):AnswerNode[]{
   const result:AnswerNode[]=[];
   for(const plan of plans){
    if(remaining<=0)break;
    if(plan.total<=remaining){result.push(plan.node);remaining-=plan.total;continue;}
    if(plan.ends.length){result.push({...plan.node,text:plan.node.text!.slice(0,plan.ends[remaining-1])});remaining=0;}
    else {const children=take(plan.children);if(children.length)result.push({...plan.node,children});}
   }
   return result;
  }
  return take(plans);
 }};
}
export function revealUnitsAt(total:number,elapsedMs:number) {
 if(!total)return 0;
 const duration=Math.min(4000,Math.max(180,total*18));
 return Math.min(total,Math.max(1,Math.floor(Math.max(0,elapsedMs)*total/duration)));
}

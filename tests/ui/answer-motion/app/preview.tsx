'use client';
import {useEffect,useRef,useState} from 'react';
import {ModelAccessProvider} from '@/components/conversations/model-access';
import {QuestionIntentProvider} from '@/components/conversations/question-intent';
import {ResearchShell} from '@/components/conversations/research-shell';
import {ThreadView,idleResearch,type ResearchState} from '@/components/conversations/thread-view';
import type {CommittedAnswer} from '@/server/chat/views';
import type {HistoryPage} from '@/server/conversations/views';
const createdAt='2026-10-31T07:00:00.000Z',conversation={id:'10000000-0000-4000-8000-000000000001',title:'How does the water cycle work?',revision:0,createdAt,updatedAt:createdAt};
const answer:CommittedAnswer={runId:'20000000-0000-4000-8000-000000000001',conversationId:conversation.id,messageId:'30000000-0000-4000-8000-000000000001',revision:1,createdAt,text:'Water moves through a continuous cycle.',answer:{kind:'ANSWER',sources:[{sourceId:'S1',number:1,url:'https://www.noaa.gov/education/resource-collections/freshwater/water-cycle',title:'The water cycle — NOAA',domain:'noaa.gov',supportStatus:'NOT_CHECKED'}],document:[
 {type:'paragraph',children:[{type:'text',text:'The water cycle moves water between the ocean, land and atmosphere. Heat from the Sun causes water to evaporate from oceans, lakes and rivers. Plants also release water vapor through their leaves, a process called '},{type:'strong',children:[{type:'text',text:'transpiration'}]},{type:'text',text:'. As moist air rises and cools, water vapor condenses into tiny droplets or ice crystals that form clouds. '},{type:'citation',number:1}]},
 {type:'paragraph',children:[{type:'text',text:'When droplets grow large enough, water returns to the surface as rain, snow or other forms of precipitation. Some water flows over the ground into streams and rivers. Some soaks into soil and becomes groundwater, which may eventually feed springs, rivers or the ocean. Water can also remain stored in glaciers, lakes and underground reservoirs before continuing its journey. '},{type:'citation',number:1}]},
 {type:'heading',depth:2,children:[{type:'text',text:'The main stages'}]},
 {type:'list',children:[{type:'listItem',children:[{type:'paragraph',children:[{type:'strong',children:[{type:'text',text:'Evaporation:'}]},{type:'text',text:' liquid water becomes vapor.'}]}]},{type:'listItem',children:[{type:'paragraph',children:[{type:'strong',children:[{type:'text',text:'Condensation:'}]},{type:'text',text:' vapor forms cloud droplets.'}]}]},{type:'listItem',children:[{type:'paragraph',children:[{type:'strong',children:[{type:'text',text:'Precipitation:'}]},{type:'text',text:' water returns to Earth.'}]}]}]},
]}};
const history:HistoryPage={items:[{id:'40000000-0000-4000-8000-000000000001',role:'USER',kind:'QUESTION',parts:[{type:'text',text:conversation.title}],sequence:1,schemaVersion:1,createdAt},{id:answer.messageId,role:'ASSISTANT',kind:'ANSWER',parts:[{type:'text',text:answer.text}],sequence:2,schemaVersion:1,createdAt,answer:answer.answer}],nextBefore:null};
export default function Lab({saved}:{saved:boolean}){
 const [state,setState]=useState<ResearchState>(idleResearch),timers=useRef<ReturnType<typeof setTimeout>[]>([]);
 const [initial,setInitial]=useState<HistoryPage>(saved?history:{items:[],nextBefore:null});
 const [attempt,setAttempt]=useState(0);
 const clear=()=>{timers.current.forEach(clearTimeout);timers.current=[];};
 useEffect(()=>()=>timers.current.forEach(clearTimeout),[]);
 function submit(question:string){
  clear();setAttempt(value=>value+1);
  const stop=()=>{clear();setState({...idleResearch,question,error:'Research stopped. You can start a new search.'});};
  setState({...idleResearch,question,pending:true,label:'Checking request',stop});
  for(const [delay,label] of [[700,'Searching the web'],[1800,'Preparing an answer'],[2800,'Checking answer']] as const)timers.current.push(setTimeout(()=>setState(current=>({...current,label})),delay));
  const result={...answer,runId:crypto.randomUUID(),messageId:crypto.randomUUID()};
  timers.current.push(setTimeout(()=>{
   setState({...idleResearch,question,committed:result,revealMessageId:result.messageId});
   // Simulate the saved server props arriving during the reveal. It must keep
   // progressing, without remounting the live answer or replaying its first words.
   timers.current.push(setTimeout(()=>setInitial(current=>({items:[...current.items,
    {...history.items[0],id:crypto.randomUUID(),sequence:current.items.length+1,parts:[{type:'text',text:question}]},
    {...history.items[1],id:result.messageId,sequence:current.items.length+2},
   ],nextBefore:null})),160));
  },3800));
 }
 return <ModelAccessProvider><QuestionIntentProvider><ResearchShell name="Offline UI preview" recent={[]} initialCollapsed>
  <ThreadView key={attempt} conversation={conversation} initial={initial} research={state} submit={submit}/>
 </ResearchShell></QuestionIntentProvider></ModelAccessProvider>;
}

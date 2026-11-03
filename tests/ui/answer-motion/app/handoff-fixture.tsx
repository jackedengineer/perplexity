'use client';
import {ModelAccessProvider} from '@/components/conversations/model-access';
import {StartQuestion} from '@/components/conversations/question-composer';
import {ResearchThread} from '@/components/conversations/research-thread';
export const handoffConversation={id:'10000000-0000-4000-8000-000000000002',title:'New search',revision:0,createdAt:'2026-11-03T00:00:00.000Z',updatedAt:'2026-11-03T00:00:00.000Z'};
// Separate route groups intentionally recreate the production navigation boundary.
// The question provider must come from the real shared root layout.
export function HandoffFixture({destination=false}:{destination?:boolean}){
 return <ModelAccessProvider>{destination?<ResearchThread conversation={handoffConversation} initial={{items:[],nextBefore:null}}/>:<StartQuestion/>}</ModelAccessProvider>;
}

"use client";
import { createContext,useContext,useMemo,useRef,type ReactNode } from "react";
export type PendingQuestion = { conversationId: string;text: string;clientRequestId: string };
type IntentContext = { stage: (question: PendingQuestion)=>void;consume: (id: string)=>PendingQuestion | null };
const Questions = createContext<IntentContext | null>(null);
// In-memory handoff across client navigation. Unapproved questions never become titles or browser storage.
export function QuestionIntentProvider({ children }: {children: ReactNode}) {
  const pending = useRef<PendingQuestion | null>(null);
  const context = useMemo(()=>({ stage: (question: PendingQuestion)=>{pending.current=question;},consume: (id: string)=>{
    if(pending.current?.conversationId!==id)return null;const value=pending.current;pending.current=null;return value;
  } }),[]);
  return <Questions.Provider value={context}>{children}</Questions.Provider>;
}
export function useQuestionIntent() { const context=useContext(Questions);if(!context)throw new Error("Question context unavailable");return context; }

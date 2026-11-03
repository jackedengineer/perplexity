'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {ModelKey} from '@/server/ai/catalog';
import {Icon} from './icons';
type Model={key:ModelKey;name:string;credits:number;band:'ECONOMY'|'STANDARD'};
const details:Record<ModelKey,{mark:string;description:string}>={
 'fast-default':{mark:'G',description:'Balanced answers · OpenAI'},
 'economy-nano':{mark:'G',description:'Quick everyday questions · OpenAI'},
 'economy-mistral':{mark:'M',description:'Compact open model · Mistral'},
 'economy-qwen':{mark:'Q',description:'Efficient open model · Qwen'},
 'economy-gemini':{mark:'✦',description:'Lightweight and fast · Google'},
 'standard-deepseek':{mark:'D',description:'Versatile open model · DeepSeek'},
};
export function ModelPicker({models,value,onSelect,disabled}:{models:Model[];value:ModelKey;onSelect:(key:ModelKey)=>void;disabled:boolean}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState<{left:number;top:number;maxHeight:number;above:boolean}|null>(null);
 const selected=models.find(m=>m.key===value);
 const close=()=>{setPosition(null);trigger.current?.focus();};
 function open(){
  const rect=trigger.current!.getBoundingClientRect(),width=Math.min(320,window.innerWidth-24);
  const above=rect.top>240,height=Math.min(420,above?rect.top-20:window.innerHeight-rect.bottom-20);
  setPosition({above,left:Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12)),top:above?rect.top-8:rect.bottom+8,maxHeight:height});
 }
 useEffect(()=>{
  if(!position)return;
  const frame=requestAnimationFrame(()=>menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  function outside(e:PointerEvent){if(!menu.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))setPosition(null);}
  function dismiss(){setPosition(null);}
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);};
 },[position]);
 return <><button type="button" ref={trigger} className="model-trigger" aria-label={`Answer model: ${selected?.name??'Unavailable'}`} aria-haspopup="menu" aria-expanded={!!position} aria-controls={position?id:undefined} disabled={disabled||!models.length}
  onClick={()=>position?close():open()} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();}}}>
  <span>{selected?.name??'Research unavailable'}</span><Icon name="down" size={13}/>
 </button>{position&&createPortal(<div ref={menu} id={id} className="model-popover" role="menu" aria-label="Answer models" style={{left:position.left,top:position.top,maxHeight:position.maxHeight,transform:position.above?'translateY(-100%)':undefined}}
 onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();close();return;}
  if(e.key==='Tab'){close();return;}
  const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')??[]),index=items.indexOf(document.activeElement as HTMLButtonElement);
  let next:number|undefined;
  if(e.key==='ArrowDown')next=(index+1)%items.length;
  if(e.key==='ArrowUp')next=(index-1+items.length)%items.length;
  if(e.key==='Home')next=0;if(e.key==='End')next=items.length-1;
  if(next!==undefined){e.preventDefault();items[next]?.focus();}
 }}>
  <div className="model-menu-heading">Choose your model<span>Credits / answer</span></div>
  {models.map(model=><button type="button" role="menuitemradio" aria-checked={model.key===value} tabIndex={-1} key={model.key} className="model-option" onClick={()=>{onSelect(model.key);close();}}>
   <span className={`model-monogram model-${model.key}`} aria-hidden="true">{details[model.key].mark}</span>
   <span className="model-option-copy"><strong>{model.name}</strong><small>{details[model.key].description}</small></span>
   <span className="model-cost">{model.credits}</span><span className="model-check" aria-hidden="true">{model.key===value?'✓':''}</span>
  </button>)}
  <p className="model-menu-note">Every answer includes web research and citations.</p>
 </div>,document.body)}</>;
}

'use client';
import Link from 'next/link';
import {useModelAccess} from './model-access';
import {Icon} from './icons';
export function PlanIndicator({compact=false,onNavigate}:{compact?:boolean;onNavigate?:()=>void}){
 const {data}=useModelAccess(),paid=data?.usage.subscription;
 if(!data)return <span className="plan-placeholder" role="status" aria-label="Loading plan"/>;
 return <Link href={paid?'/billing':'/pricing'} onClick={onNavigate} className={`plan-indicator ${paid?'is-pro':'is-upgrade'} ${compact?'plan-compact':''}`} aria-label={paid?'Pro subscription — manage billing':'Upgrade to Pro'} title={paid?`Pro · ${paid.reportsRemaining} Deep Research reports remaining`:'Upgrade to Pro · 7 Deep Research reports'}>
  <Icon name="automation" size={15}/><span>{paid?'Pro':compact?'Pro':'Upgrade to Pro'}</span>{paid&&!compact&&<span className="plan-allowance">{paid.reportsRemaining} reports left</span>}{!compact&&!paid&&<span className="plan-link-arrow" aria-hidden="true">↗</span>}
 </Link>;
}

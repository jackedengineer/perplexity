// Privileged renewal logic, separate from the CLI so it can be tested against real migrations.
const dayMs=86400000;
// A ceiling outside this list needs review. Renewal never raises a ceiling.
const reviewedPeriodCeilings=[200000n,400000n,1000000n,1700000n];
const nextUtcMidnight=time=>Math.floor(time/dayMs)*dayMs+dayMs;

export function renewalEnd(key,now=Date.now()){
 const resets=key.limit_reset===null||key.limit_reset==='daily';
 if(typeof key.limit!=='number'||!Number.isFinite(key.limit)||key.limit<=0||key.limit>2||!resets||!Number.isFinite(key.limit_remaining)||key.limit_remaining<0.05)throw new Error('Expected a key capped at $2 or less, non-resetting or daily, with reservation capacity');
 const expiry=new Date(key.expires_at).getTime();
 if(!Number.isFinite(expiry)||expiry<=now+60000)throw new Error('Key expiry must be renewed first');
 return new Date(Math.min(expiry,now+7*dayMs));
}

// Continue the existing schedule of whole UTC days. Stretching the active window instead
// would overlap a later one, and two active days make every admission fail. Leaving days
// uncovered would let ensure_operator_day create rolling windows at its lower default.
export function planDayWindows(days,endsAt,now,fallbackLimit){
 const live=days.map(d=>({id:d.id,startsAt:new Date(d.starts_at).getTime(),endsAt:new Date(d.ends_at).getTime(),limit:BigInt(d.provider_limit_micro_usd)})).filter(d=>d.endsAt>now).sort((a,b)=>a.startsAt-b.startsAt);
 if(live.some((day,index)=>index>0&&day.startsAt<live[index-1].endsAt))throw new Error('Overlapping day windows');
 const end=endsAt.getTime(),last=live.at(-1),limit=last?.limit??fallbackLimit,plan={extend:null,insert:[]};
 let cursor=last?.endsAt??now;
 if(cursor>=end)return plan;
 if(last&&cursor%dayMs!==0){cursor=Math.min(end,nextUtcMidnight(cursor));plan.extend={id:last.id,endsAt:new Date(cursor)};}
 while(cursor<end){const to=Math.min(end,nextUtcMidnight(cursor));plan.insert.push({startsAt:new Date(cursor),endsAt:new Date(to),limit});cursor=to;}
 return plan;
}

// Preserves the period's identity, reservations, settled spend and ceiling.
export async function renewOperatorWindow(client,{budgetKey,endsAt,apply=false,now=Date.now()}){
 await client.query('BEGIN');
 try {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('perplex:operator-renewal'))");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('perplex:operator-day:' || $1::text,0))",[budgetKey]);
  const {rows}=await client.query('SELECT * FROM operator_usage_buckets WHERE budget_key=$1 ORDER BY id FOR UPDATE',[budgetKey]);
  const periods=rows.filter(r=>r.kind==='PERIOD').sort((a,b)=>new Date(b.ends_at)-new Date(a.ends_at)),period=periods[0];
  if(!period||!reviewedPeriodCeilings.includes(BigInt(period.provider_limit_micro_usd)))throw new Error('Review existing period ceiling before renewal');
  if(periods.filter(r=>new Date(r.ends_at).getTime()>now).length>1)throw new Error('Overlapping period windows');
  if(endsAt.getTime()<new Date(period.ends_at).getTime())throw new Error('Renewal would shorten the period');
  const ceiling=BigInt(period.provider_limit_micro_usd),available=ceiling-BigInt(period.reserved_provider_micro_usd)-BigInt(period.settled_provider_micro_usd);
  if(available<50000n)throw new Error('Reconcile verified receipts before renewing exhausted capacity');
  const plan=planDayWindows(rows.filter(r=>r.kind==='DAY'),endsAt,now,ceiling<400000n?ceiling:400000n);
  if(apply) {
   await client.query('UPDATE operator_usage_buckets SET ends_at=$1 WHERE id=$2',[endsAt.toISOString(),period.id]);
   if(plan.extend)await client.query('UPDATE operator_usage_buckets SET ends_at=$1 WHERE id=$2',[plan.extend.endsAt.toISOString(),plan.extend.id]);
   for(const day of plan.insert)await client.query("INSERT INTO operator_usage_buckets (budget_key,kind,starts_at,ends_at,provider_limit_micro_usd) VALUES ($1,'DAY',$2,$3,$4)",[budgetKey,day.startsAt.toISOString(),day.endsAt.toISOString(),day.limit.toString()]);
  }
  await client.query(apply?'COMMIT':'ROLLBACK');
  return {applied:apply,endsAt,previousEndsAt:new Date(period.ends_at),periodCeilingMicroUsd:ceiling.toString(),periodAvailableMicroUsd:available.toString(),dayWindowExtended:Boolean(plan.extend),dayWindowsAdded:plan.insert.length,dayLimitMicroUsd:(plan.insert[0]?.limit??null)?.toString()??null,existingSpendAndHoldsPreserved:true};
 }catch(error){await client.query('ROLLBACK');throw error;}
}

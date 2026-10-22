// Best effort cross-process abort. Durable DB fencing remains the authority.
export function startRunMonitor(probe:()=>Promise<boolean>,incoming:AbortSignal,deadlineAt:number,intervalMs=1000) {
 const controller=new AbortController();let checking=false,stopped=false;
 const stop=()=>{stopped=true;clearInterval(timer);clearTimeout(deadline);};
 const timer=setInterval(()=>{
  if(checking||stopped||controller.signal.aborted||incoming.aborted)return;
  checking=true;
  void probe().then(active=>{if(!active&&!stopped)controller.abort();},()=>{if(!stopped)controller.abort();}).finally(()=>{checking=false;});
 },intervalMs);
 const deadline=setTimeout(()=>controller.abort(),Math.max(0,deadlineAt-Date.now()));
 timer.unref?.();deadline.unref?.();
 return {signal:AbortSignal.any([incoming,controller.signal]),stop};
}

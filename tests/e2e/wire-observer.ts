import type { Page } from "@playwright/test";
declare global {interface Window {t11Received:string[];t11Timings:{type:string;stage?:string;atMs:number}[][];t11Rendering:{lcp:number;cls:number;longTasks:number[]}}}
// Observe a cloned response without buffering the actual UI stream or changing the endpoint.
export async function observeChatWire(page: Page) {
  await page.addInitScript(()=>{
    const original=window.fetch;window.t11Received=[];window.t11Timings=[];
    window.t11Rendering={lcp:0,cls:0,longTasks:[]};
    new PerformanceObserver(list=>{for(const entry of list.getEntries())window.t11Rendering.lcp=entry.startTime;}).observe({type:"largest-contentful-paint",buffered:true});
    new PerformanceObserver(list=>{for(const entry of list.getEntries()){const shift=entry as PerformanceEntry&{hadRecentInput:boolean;value:number};if(!shift.hadRecentInput)window.t11Rendering.cls+=shift.value;}}).observe({type:"layout-shift",buffered:true});
    new PerformanceObserver(list=>{for(const entry of list.getEntries())window.t11Rendering.longTasks.push(entry.duration);}).observe({type:"longtask",buffered:true});
    window.fetch=async(...args)=>{
      const started=performance.now(),response=await original(...args);
      const url=String(args[0] instanceof Request?args[0].url:args[0]);
      if(url.endsWith("/api/chat")&&response.body){
        const reader=response.clone().body!.getReader();
        void (async()=>{
          const decoder=new TextDecoder(),events:{type:string;stage?:string;atMs:number}[]=[];let bytes="",buffer="";
          try {for(;;){const next=await reader.read();if(next.done)break;const text=decoder.decode(next.value,{stream:true});bytes+=text;buffer+=text;
            if(bytes.length>128000)throw new Error("Fixture wire exceeded bound");
            const lines=buffer.split("\n");buffer=lines.pop()??"";
            for(const line of lines){if(!line.startsWith("data: ")||line.includes("[DONE]"))continue;const frame=JSON.parse(line.slice(6));events.push({type:frame.type,...(frame.data?.stage?{stage:frame.data.stage}:{}),atMs:Math.round(performance.now()-started)});}
          }} catch {/* Preserve partial bytes on an intentional abort. */}
          finally {reader.releaseLock();window.t11Received.push(bytes);window.t11Timings.push(events);}
        })();
      }
      return response;
    };
  });
}

// Test-runner preload only. Never imported by application code or enabled by an app route.
import { appendFileSync } from "node:fs";
if(process.env.T11_PROVIDER_FIXTURE!=="1"||process.env.OPENROUTER_API_KEY!=="t11-synthetic-provider-key"||process.env.BETTER_AUTH_URL!=="http://localhost:3001")throw new Error("Isolated T11 fixture configuration required");
if(new URL(process.env.DATABASE_URL??"http://missing").hostname!=="ep-sweet-night-az8bacv2-pooler.c-3.ap-southeast-1.aws.neon.tech")throw new Error("Dedicated development DB required");
const originalFetch=globalThis.fetch;
const answer=[
  "A rainbow appears when sunlight interacts with water droplets in the air. The drops **refract, reflect, and disperse** the light, separating it into the colors we see [S1].",
  "**Refraction:** Light changes direction when it enters the water [S1]. **Dispersion:** Different wavelengths bend by different amounts [S2]. **Internal reflection:** Light reflects from the back of the droplet [S1]. **Refraction again:** The light bends once more as it leaves the drop [S2].",
  "With the Sun behind you and rain ahead, the brightest rays reach your eyes at about **42 degrees** from the direction opposite the Sun. Many drops contribute light along the same cone, which appears as an arc [S2].",
  "Your eyes receive light from a particular set of droplets. Someone standing beside you receives light from a different set, so each observer sees their own rainbow [S3].",
].join("\n\n");
function record(stage,scenario){appendFileSync(".artifacts/t11-provider-calls.jsonl",JSON.stringify({stage,scenario})+"\n");}
globalThis.fetch=async(input,init)=>{
  const url=String(input instanceof Request?input.url:input);
  if((url.includes("openrouter.ai")||url.includes("api.tavily.com"))&&url!=="https://openrouter.ai/api/v1/chat/completions"&&url!=="https://api.tavily.com/search")throw new Error("Fixture forbids unmatched provider request");
  if(url!=="https://openrouter.ai/api/v1/chat/completions"&&url!=="https://api.tavily.com/search")return originalFetch(input,init);
  const body=JSON.parse(String(init?.body??"{}")),raw=JSON.stringify(body);
  const scenario=raw.includes("t19-safety-deadline")?"t19-safety-deadline":raw.includes("t19-deadline")?"t19-deadline":raw.includes("t18-cancel")?"t18-cancel":raw.includes("t11-input-block")?"input-block":raw.includes("t11-output-block")?"output-block":raw.includes("t11-invalid-citation")?"invalid-citation":raw.includes("t11-search-failure")?"search-failure":raw.includes("t11-no-evidence")?"no-evidence":"allowed";
  if(url.includes("tavily")){
    record("search",scenario);
    if(scenario==="search-failure")return Response.json({error:"PRIVATE_UPSTREAM_MUST_NOT_LEAK"},{status:503});
    return Response.json({usage:{credits:1},results:scenario==="no-evidence"?[]:[
      {title:"What Causes a Rainbow? | NOAA",url:"https://www.nesdis.noaa.gov/about/k-12-education/optical-phenomena/what-causes-rainbow",content:"Water droplets refract incoming sunlight, reflect it internally and disperse its colors.",score:.99},
      {title:"How Do Rainbows Form? — National Weather Service",url:"https://www.weather.gov/fgz/Rainbow",content:"Different colors emerge at different angles. The primary rainbow is about 42 degrees from the antisolar direction.",score:.98},
      {title:"Rainbows: Water and Light — USGS",url:"https://www.usgs.gov/water-science-school/science/rainbows-water-and-light",content:"Each observer sees light arriving from a different collection of water droplets.",score:.97},
    ]});
  }
  const content=body.messages?.[0]?.content;
  const system=typeof content==="string"?content:Array.isArray(content)?content.map(part=>part.text??"").join("\n"):"";
  const output=system.startsWith("Inspect the COMPLETE visible response");
  const stage=body.model==="test/answer"?"answer":output?"output":"guard";record(stage,scenario);
  if(scenario==="t19-safety-deadline"||stage==="answer"&&(scenario==="t18-cancel"||scenario==="t19-deadline"))await new Promise((resolve,reject)=>{
    const timer=setTimeout(resolve,scenario==="t19-safety-deadline"?6000:scenario==="t19-deadline"?15000:9000);
    const abort=()=>{record("answer-abort",scenario);clearTimeout(timer);reject(new Error("Synthetic provider aborted"));};
    if(init?.signal?.aborted)abort();else init?.signal?.addEventListener("abort",abort,{once:true});
  });
  const blocked=scenario==="input-block"||(output&&scenario==="output-block");
  const text=body.model==="test/answer"?(scenario==="t18-cancel"?"T18_PRIVATE_LATE_DRAFT [S1].":scenario==="output-block"?"UNREVIEWED_PRIVATE_DRAFT [S1].":scenario==="invalid-citation"?"UNREVIEWED_PRIVATE_DRAFT [S9].":answer):JSON.stringify({classification:blocked?["FRAUD"]:"ALLOW",policyVersion:"v1"});
  return Response.json({id:"synthetic-t11",model:body.model,created:1,choices:[{index:0,finish_reason:"stop",message:{role:"assistant",content:body.model==="test/answer"?JSON.stringify({paragraphs:text.split("\n\n").map(text=>({text:text.replace(/\[S[1-9]\]/gu,""),sourceIds:[...new Set([...text.matchAll(/\[(S[1-9])\]/gu)].map(match=>match[1]))].length?[...new Set([...text.matchAll(/\[(S[1-9])\]/gu)].map(match=>match[1]))]:["S1"]}))}):text,reasoning:"PRIVATE_REASONING_MUST_NOT_LEAK"}}],usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200,cost:.0001}});
};


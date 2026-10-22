// Test-runner preload only. Never imported by application code or enabled by an app route.
import { appendFileSync } from "node:fs";
if(process.env.T11_PROVIDER_FIXTURE!=="1"||process.env.OPENROUTER_API_KEY!=="t11-synthetic-provider-key"||process.env.BETTER_AUTH_URL!=="http://localhost:3001")throw new Error("Isolated T11 fixture configuration required");
const originalFetch=globalThis.fetch;
const answer=[
  "A rainbow appears when sunlight interacts with water droplets in the air. The drops **refract, reflect, and disperse** the light, separating it into the colors we see [S1].",
  "## What happens inside a raindrop",
  "1. **Refraction:** Light changes direction when it enters the water [S1].\n2. **Dispersion:** Different wavelengths bend by different amounts [S2].\n3. **Internal reflection:** Light reflects from the back of the droplet [S1].\n4. **Refraction again:** The light bends once more as it leaves the drop [S2].",
  "## Why it looks like an arc",
  "With the Sun behind you and rain ahead, the brightest rays reach your eyes at about **42 degrees** from the direction opposite the Sun. Many drops contribute light along the same cone, which appears as an arc [S2].",
  "## A different rainbow for everyone",
  "Your eyes receive light from a particular set of droplets. Someone standing beside you receives light from a different set, so each observer sees their own rainbow [S3].",
].join("\n\n");
function record(stage,scenario){appendFileSync(".artifacts/t11-provider-calls.jsonl",JSON.stringify({stage,scenario})+"\n");}
globalThis.fetch=async(input,init)=>{
  const url=String(input instanceof Request?input.url:input);
  if(url!=="https://openrouter.ai/api/v1/chat/completions"&&url!=="https://api.tavily.com/search")return originalFetch(input,init);
  const body=JSON.parse(String(init?.body??"{}")),raw=JSON.stringify(body);
  const scenario=raw.includes("t11-input-block")?"input-block":raw.includes("t11-output-block")?"output-block":raw.includes("t11-invalid-citation")?"invalid-citation":raw.includes("t11-search-failure")?"search-failure":raw.includes("t11-no-evidence")?"no-evidence":"allowed";
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
  const blocked=scenario==="input-block"||(output&&scenario==="output-block");
  const text=body.model==="test/answer"?(scenario==="output-block"?"UNREVIEWED_PRIVATE_DRAFT [S1].":scenario==="invalid-citation"?"UNREVIEWED_PRIVATE_DRAFT [S9].":answer):JSON.stringify({decision:blocked?"BLOCK":"ALLOW",categoryCodes:blocked?["FRAUD"]:[],policyVersion:"v1",retryable:null});
  return Response.json({id:"synthetic-t11",model:body.model,created:1,choices:[{index:0,finish_reason:"stop",message:{role:"assistant",content:text,reasoning:"PRIVATE_REASONING_MUST_NOT_LEAK"}}],usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200,cost:.0001}});
};


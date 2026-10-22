import { expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { presentAnswer } from "@/server/answers/presentation";
const source = { sourceId: "S1",number: 1,url: "https://weather.gov/rainbow",title: "How rainbows form",publishedAt: null,passageIds: [randomUUID()],contentHashes: ["a".repeat(64)],supportStatus: "NOT_CHECKED" };
const payload = (markdown = "Light bends **inside droplets** [S1].")=>({ runId: randomUUID(),attemptVersion: 1,revision: 1,policyVersion: "v1",kind: "ANSWER",markdown,sources: [source] });
it("compiles approved Markdown into bounded render data and citation numbers",()=>{
  const answer = presentAnswer(payload());
  expect(answer.sources[0]).toEqual({ sourceId: "S1",number: 1,url: source.url,title: source.title,domain: "weather.gov",supportStatus: "NOT_CHECKED" });
  expect(JSON.stringify(answer)).toContain('"type":"citation","number":1');
  expect(JSON.stringify(answer)).not.toMatch(/passageIds|contentHashes|attemptVersion|runId/);
});
it.each(["[click](https://evil.example)","<script>alert(1)</script> [S1]","Invented [S4]","![image](https://evil.example/a.png)"])("rejects invalid stored presentation: %s",markdown=>expect(()=>presentAnswer(payload(markdown))).toThrow());
it("keeps code literal and produces heading, list and emphasis nodes",()=>{
  const answer = presentAnswer(payload("## How it works\n\n1. **Refraction** bends light [S1].\n\n`[S1]` is a marker."));
  expect(answer.document.map(n=>n.type)).toEqual(["heading","list","paragraph"]);
  expect(answer.document[2].children?.[0]).toMatchObject({ type: "inlineCode",text: "[S1]" });
});
it("fixed no-evidence answers have no citations",()=>{
  const answer = presentAnswer({ ...payload("I couldn’t find enough usable evidence."),kind: "NO_EVIDENCE",sources: [] });
  expect(answer.sources).toEqual([]);
});

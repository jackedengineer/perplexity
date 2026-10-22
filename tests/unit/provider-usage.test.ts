import { expect,it } from "vitest";
import { microUsd,providerUsage } from "@/server/ai/usage";
it.each([["0",0n],["0.001",1000n],["0.0000011",2n],["0.000000000000000001",1n],["1.000000001",1000001n]])("rounds %s conservatively without floating-point arithmetic",(value,expected)=>{
  expect(microUsd(value)).toBe(expected);
});
it.each([undefined,null,"-1","Infinity","1e-8",NaN,{},"0.1234567890123456789"])("keeps malformed cost unknown",value=>{
  expect(microUsd(value)).toBeNull();
});
it("keeps missing usage unknown and permits an explicitly reported zero",()=>{
  expect(providerUsage(undefined)).toMatchObject({ costMicroUsd: null,inputTokens: null,outputTokens: null });
  expect(providerUsage({ cost: 0,prompt_tokens: 1,completion_tokens: 2 },"test/model")).toEqual({ costMicroUsd: 0n,inputTokens: 1,outputTokens: 2,actualModel: "test/model" });
  expect(providerUsage({ cost: "0.0000001",prompt_tokens: -1 },"<private error>").costMicroUsd).toBeNull();
});

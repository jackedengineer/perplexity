import {inspectInput} from './deterministic';
import {outputSafetyInputSchema,SafetyProviderError,type SafetyProvider} from './provider';
import {SAFETY_POLICY} from './policy';

export const LOCAL_GUARD_VERSION='local-boundary-v1';
export const LOCAL_GUARD_MODEL=Object.freeze({modelId:'local/boundary-v1',provider:'local'});
const guards=new WeakSet<object>();
export function isLocalSafetyGuard(value:SafetyProvider|undefined):boolean {
 return !!value&&guards.has(value);
}
// A finite local boundary check, NOT semantic moderation. Generation providers
// own semantic refusal. No model call, keyword topic filter or outage fallback.
export function createLocalSafetyGuard():SafetyProvider {
 const guard:SafetyProvider={
  modelId:LOCAL_GUARD_MODEL.modelId,
  usage:()=>({costMicroUsd:0n,inputTokens:0,outputTokens:0,actualModel:null}),
  async classify(value,signal){
   if(signal.aborted)throw new SafetyProviderError('TIMEOUT');
   const input=outputSafetyInputSchema.parse(value),category=inspectInput(input);
   return category?{decision:'BLOCK',categoryCodes:[category],policyVersion:SAFETY_POLICY.version}
    :{decision:'ALLOW',categoryCodes:[],policyVersion:SAFETY_POLICY.version};
  },
 };
 guards.add(guard);return Object.freeze(guard);
}

// Lower-cased word tokens, keeping joined forms like "e-mail" or "v1.2" whole and dropping a
// possessive 's. Shared by the planner's vocabulary checks and memory grounding.
export const words=(text:string)=>(text.normalize('NFKC').replace(/[’‘]/gu,"'").toLowerCase().match(/[\p{L}\p{N}]+(?:[._'-][\p{L}\p{N}]+)*/gu)??[]).map(word=>word.replace(/'s$/u,''));

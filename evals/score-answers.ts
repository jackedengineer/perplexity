import {matchObservations,rate,summarizeUsage,type Status,type TimingCost} from './shared';
export type Support='SUPPORTED'|'UNSUPPORTED'|'UNCERTAIN';
export type ScoredClaim={support:Support|null;judgeSupport?:Support|null;cited:boolean};
export type AnswerObservation=TimingCost&{id:string;disposition:'ANSWER'|'REFUSAL'|'ERROR'|'NO_EVIDENCE'|'CLARIFICATION';citationValid:boolean;claims:ScoredClaim[]};
export function scoreAnswers(cases:readonly {id:string;kind?:string}[],observations:readonly AnswerObservation[]){
 const matched=matchObservations(cases,observations),expectedAnswers=matched.filter(r=>r.observation&&(r.testCase.kind===undefined||r.testCase.kind==='ANSWER'));
 const falseRefusals=rate(expectedAnswers.filter(r=>r.observation!.disposition==='REFUSAL').length,expectedAnswers.length);
 const answerCoverage=rate(expectedAnswers.filter(r=>r.observation!.disposition==='ANSWER').length,expectedAnswers.length);
 const exceptions=matched.filter(r=>r.testCase.kind==='CLARIFICATION'||r.testCase.kind==='NO_EVIDENCE');
 const requiredDisposition=rate(exceptions.filter(r=>r.observation?.disposition===r.testCase.kind).length,exceptions.length);
 const wrongDisposition=exceptions.filter(r=>r.observation&&r.observation.disposition!=='ERROR'&&r.observation.disposition!==r.testCase.kind).length;
 const answers=observations.filter(r=>r.disposition==='ANSWER'),claims=answers.flatMap(r=>r.claims);
 const reviewed=claims.filter(c=>c.support!==null),paired=reviewed.filter(c=>c.judgeSupport!=null);
 const supportedClaims=rate(reviewed.filter(c=>c.support==='SUPPORTED').length,reviewed.length);
 const citationCoverage=rate(claims.filter(c=>c.cited).length,claims.length);
 const judgeAgreement=rate(paired.filter(c=>c.support===c.judgeSupport).length,paired.length);
 const invalidCitations=observations.filter(r=>!r.citationValid).length;
 const failure=wrongDisposition>0||(falseRefusals.rate??0)>.05||invalidCitations>0||citationCoverage.rate!==null&&citationCoverage.rate<.95||supportedClaims.rate!==null&&supportedClaims.rate<.9;
 const pending=cases.length-observations.length;
 const releaseStatus:Status=failure?'FAIL':pending||requiredDisposition.numerator<requiredDisposition.denominator||answerCoverage.numerator<answerCoverage.denominator||reviewed.length<30||reviewed.length!==claims.length||answers.length<10?'PENDING':'PASS';
 return {cases:cases.length,executed:observations.length,pending,answers:answers.length,sampledClaims:claims.length,unreviewedClaims:claims.length-reviewed.length,
  supportedClaims,citationCoverage,judgeAgreement,invalidCitations,falseRefusals,answerCoverage,requiredDisposition,releaseStatus,usage:summarizeUsage(observations)};
}

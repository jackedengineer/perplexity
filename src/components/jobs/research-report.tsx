'use client';
import {useState,useMemo,type ReactNode} from 'react';
import {useAnswerReveal} from '@/components/conversations/use-answer-reveal';
import type {PublicResearchReport} from '@/server/deep-research/view';
import type {AnswerNode,PublicAnswer} from '@/server/answers/view';
function document(nodes:AnswerNode[],answer:PublicAnswer):ReactNode{
 return nodes.map((node,index)=>{const children=node.children?document(node.children,answer):null;
  switch(node.type){
   case 'text':return node.text;
   case 'citation':{const source=answer.sources.find(s=>s.number===node.number);return source?<a className="deep-citation" key={index} href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={source.title} aria-label={`Source ${source.number}: ${source.title}`}>{source.number}</a>:null;}
   case 'paragraph':return <p key={index}>{children}</p>;
   case 'strong':return <strong key={index}>{children}</strong>;
   case 'emphasis':return <em key={index}>{children}</em>;
   case 'heading':return <h3 key={index}>{children}</h3>;
   case 'blockquote':return <blockquote key={index}>{children}</blockquote>;
   case 'list':return node.ordered?<ol key={index}>{children}</ol>:<ul key={index}>{children}</ul>;
   case 'listItem':return <li key={index}>{children}</li>;
   case 'inlineCode':return <code key={index}>{node.text}</code>;
   case 'code':return <pre key={index}><code>{node.text}</code></pre>;
   case 'break':return <br key={index}/>;
   case 'thematicBreak':return <hr key={index}/>;
  }
 });
}
function ReportSection({section,id}:{section:PublicResearchReport['sections'][number];id:string}){
 const approved=useMemo(()=>({messageId:id,answer:section.answer}),[id,section.answer]),reveal=useAnswerReveal(approved);
 return <section aria-label={section.title}><h2>{section.title}</h2><div className="deep-prose" aria-busy={reveal?.active??false} aria-live="off">{document(reveal?.document??section.answer.document,section.answer)}</div>{reveal?.active&&<button className="jobs-stop" onClick={reveal.finish}>Show full section</button>}</section>;
}
export function ResearchReport({report}:{report:PublicResearchReport}){
 const [copied,setCopied]=useState('');
 const sources=[...new Map(report.sections.flatMap(s=>[...s.answer.sources,...s.answer.additionalSources??[]]).map(s=>[s.url,s])).values()];
 const markdown=()=>`# ${report.question}\n\n`+report.sections.map(section=>`## ${section.title}\n\n${section.markdown}\n\n`+section.answer.sources.map(s=>`[${s.sourceId}]: ${s.url}`).join('\n')).join('\n\n');
 function download(){const url=URL.createObjectURL(new Blob([markdown()],{type:'text/markdown;charset=utf-8'})),link=window.document.createElement('a');link.href=url;link.download='research-report.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <article className="deep-report" aria-labelledby="report-title"><div className="jobs-card-heading"><div><span className="jobs-eyebrow">RESEARCH COMPLETE</span><h2 id="report-title">{report.question}</h2></div><button className="jobs-stop" onClick={download}>Export</button></div>
  {report.sections.map(section=><ReportSection key={section.title} section={section} id={report.createdAt+':'+section.title}/>)}
  <details className="deep-sources"><summary>{sources.length} research sources</summary>{sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><strong>{source.title}</strong><small>{source.domain} · {source.contentKind==='EXTRACTED_PAGE'?'Page excerpt':'Search passage'}</small></a>)}</details>
  <p className="jobs-note">Citations identify retrieved evidence; factual support has not been independently verified. Research can contain errors. Conflicts and missing evidence belong in the limitations above.</p>
  <div className="jobs-actions"><button className="jobs-stop" onClick={async()=>{try{await navigator.clipboard.writeText(markdown());setCopied('Report copied');}catch{setCopied('Copy unavailable. Use Export instead.');}}}>Copy report</button><span role="status">{copied}</span></div>
 </article>;
}

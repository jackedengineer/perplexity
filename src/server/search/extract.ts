import {z} from 'zod';
import {canonicalSourceUrl} from './evidence';
import {boundedSearch,RetrievalError,type RetrievalOptions} from './limits';
import {readSearchResponse} from './tavily';
import {safeRawEvidenceText} from './raw-text';
const responseSchema=z.object({results:z.array(z.object({url:z.string().max(2048),raw_content:z.string().max(16000)})).max(2),failed_results:z.array(z.object({url:z.string().max(2048)})).max(2),usage:z.object({credits:z.int().min(0).max(1)})});
export type ExtractResponse={pages:Array<{url:string;content:string;retrievedAt:string}>;failedUrls:string[];rejectedUrls:string[];credits:0|1};
export interface ExtractProvider{extract(selectedUrls:readonly string[],options:RetrievalOptions):Promise<ExtractResponse>}
export function createTavilyExtract(apiKey:string,request:typeof fetch=fetch):ExtractProvider{
 if(!apiKey||apiKey.length>512||/\s/u.test(apiKey))throw new RetrievalError();
 return {async extract(selectedUrls,options){
  const urls=z.array(z.string().max(2048)).min(1).max(2).parse([...selectedUrls]);
  if(new Set(urls).size!==urls.length||urls.some(url=>canonicalSourceUrl(url)!==url))throw new RetrievalError('INVALID_INPUT');
  return boundedSearch(options,async signal=>{
   const response=await request('https://api.tavily.com/extract',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},redirect:'error',credentials:'omit',cache:'no-store',signal,
    body:JSON.stringify({urls,extract_depth:'basic',format:'text',include_images:false,include_favicon:false,include_usage:true,timeout:5})});
   if(!response.ok||signal.aborted||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json'){void response.body?.cancel().catch(()=>{});throw new RetrievalError();}
   const decoded=responseSchema.parse(await readSearchResponse(response,signal)),returned=[...decoded.results,...decoded.failed_results];
   if(returned.some(r=>!urls.includes(r.url))||new Set(returned.map(r=>r.url)).size!==returned.length)throw new RetrievalError();
   const pages:ExtractResponse['pages']=[],rejectedUrls:string[]=[];
   for(const result of decoded.results){
    if(!safeRawEvidenceText(result.raw_content)){rejectedUrls.push(result.url);continue;}
    pages.push({url:result.url,content:result.raw_content,retrievedAt:new Date().toISOString()});
   }
   return {pages,rejectedUrls,failedUrls:urls.filter(url=>!decoded.results.some(r=>r.url===url)),credits:decoded.usage.credits as 0|1};
  });
 }};
}

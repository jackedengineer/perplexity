import { z } from "zod";
import { boundedSearch, RETRIEVAL_LIMITS, RetrievalError, searchQuerySchema, type RetrievalOptions } from "./limits";

const resultSchema = z.object({ title: z.string().max(2000),url: z.string().max(4096),content: z.string().max(16000),
  score: z.number().finite().min(0).max(1), published_date: z.string().max(128).nullable().optional() });
const responseSchema = z.object({ results: z.array(resultSchema).max(RETRIEVAL_LIMITS.results),
  usage: z.object({ credits: z.literal(1) }) });
export type SearchResult = z.infer<typeof resultSchema>;
export type SearchResponse = { results: SearchResult[]; credits: 1 };
export const searchFiltersSchema=z.strictObject({freshness:z.enum(["ANY","RECENT","SPECIFIC_RANGE"]),startDate:z.iso.date().nullable(),endDate:z.iso.date().nullable(),preferredDomains:z.array(z.string().regex(/^[a-z0-9.-]+$/u)).max(3)});
export type SearchOptions=RetrievalOptions&{filters?:z.infer<typeof searchFiltersSchema>};
export interface SearchProvider { search(query: unknown, options: SearchOptions): Promise<SearchResponse> }
export async function readSearchResponse(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) throw new RetrievalError();
  const chunks: Uint8Array[] = []; let length = 0;
  const cancel = () => { void reader.cancel().catch(()=>undefined); };
  signal.addEventListener("abort",cancel,{ once: true });
  if (signal.aborted) cancel();
  try {
    while (true) {
      const { done,value } = await reader.read();
      if (signal.aborted) throw new RetrievalError();
      if (done) break;
      length += value.byteLength;
      if (length > RETRIEVAL_LIMITS.responseBytes) { cancel(); throw new RetrievalError(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8",{ fatal: true }).decode(bytes));
  } finally { signal.removeEventListener("abort",cancel); reader.releaseLock(); }
}
export function createTavilySearch(apiKey: string, request: typeof fetch = fetch): SearchProvider {
  if (!apiKey || apiKey.length > 512 || /\s/u.test(apiKey)) throw new RetrievalError();
  return {
    async search(query,options) {
      const parsed = searchQuerySchema.safeParse(query);
      if (!parsed.success) throw new RetrievalError("INVALID_INPUT");
      const filters=options.filters?searchFiltersSchema.parse(options.filters):undefined;
      if(filters&&(filters.freshness==='SPECIFIC_RANGE'?(!filters.startDate||!filters.endDate||filters.startDate>filters.endDate):filters.startDate!==null||filters.endDate!==null))throw new RetrievalError('INVALID_INPUT');
      return boundedSearch(options,async(signal)=>{
        const response = await request("https://api.tavily.com/search",{
          method: "POST",headers: { Authorization: `Bearer ${apiKey}`,"Content-Type": "application/json" },
          redirect: "error",credentials: "omit",cache: "no-store",signal,
          body: JSON.stringify({ query: parsed.data,topic: "general",search_depth: "basic",max_results: 5,chunks_per_source: 3,
            ...(filters?{include_published_date:true,...(filters.freshness==='RECENT'?{time_range:'month'}:{}),...(filters.freshness==='SPECIFIC_RANGE'?{start_date:filters.startDate,end_date:filters.endDate,filter_by_published_date:true}:{}),...(filters.preferredDomains.length?{include_domains:filters.preferredDomains,include_domains_mode:'prefer'}:{})}:{}),
            auto_parameters: false,include_answer: false,include_raw_content: false,include_images: false,
            include_favicon: false,include_usage: true }),
        });
        if (signal.aborted) { void response.body?.cancel().catch(()=>undefined); throw new RetrievalError(); }
        if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
          void response.body?.cancel().catch(()=>undefined); throw new RetrievalError();
        }
        const decoded = responseSchema.parse(await readSearchResponse(response,signal));
        // Do not retain the provider's echoed query, answer, images or diagnostic prose.
        return { results: decoded.results,credits: decoded.usage.credits };
      });
    },
  };
}

import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import * as schema from '@/db/schema';
import {seedCompletion} from '../helpers/completion';
const pg=new PGlite(),db=drizzle(pg,{schema});
beforeAll(async()=>{const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const entry of journal.entries)await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));});
beforeEach(async()=>{await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);});
afterAll(()=>pg.close());
const owner=async()=>{const subject=randomUUID();await db.insert(schema.user).values({id:subject,name:'Reader',email:`${subject}@example.test`});return (await db.insert(schema.appUsers).values({authSubject:subject}).returning())[0];};
const document=(userId:string,change:Partial<typeof schema.documents.$inferInsert>={})=>({userId,title:'report.pdf',contentHash:'a'.repeat(64),storageKey:`documents/${userId}/x`,byteSize:10,pageCount:1,status:'PROCESSING',createdAt:new Date(),updatedAt:new Date(),...change});
const vector=(value:number)=>Array.from({length:schema.DOCUMENT_EMBEDDING_DIMENSIONS},(_,i)=>i===0?value:0);
const violation={cause:{code:'23514'}};

it('keeps a chunk tied to a document of the same owner',async()=>{
  const [a,b]=[await owner(),await owner()];
  const [doc]=await db.insert(schema.documents).values(document(a.id)).returning();
  await db.insert(schema.documentChunks).values({documentId:doc.id,userId:a.id,ordinal:0,page:1,text:'Turbidity was 0.37 NTU.'});
  await expect(db.insert(schema.documentChunks).values({documentId:doc.id,userId:b.id,ordinal:1,page:1,text:'Foreign owner'})).rejects.toMatchObject({cause:{code:'23503'}});
});
it('rejects inconsistent document and chunk states',async()=>{
  const a=await owner();
  for(const change of [{status:'READY',chunkCount:2,embeddedCount:1},{status:'FAILED'},{status:'PROCESSING',failureCode:'SCANNED'},{contentHash:'nothex'},{title:'  '},{status:'DONE'}])
    await expect(db.insert(schema.documents).values(document(a.id,change))).rejects.toMatchObject(violation);
  const [doc]=await db.insert(schema.documents).values(document(a.id)).returning();
  for(const change of [{page:0},{text:' '},{text:'x'.repeat(1001)},{embedding:vector(1)},{embeddingModel:'openai/text-embedding-3-small'}])
    await expect(db.insert(schema.documentChunks).values({documentId:doc.id,userId:a.id,ordinal:0,page:1,text:'Text',...change})).rejects.toMatchObject(violation);
});
it('stores vectors and keyword search text for retrieval',async()=>{
  const a=await owner();const [doc]=await db.insert(schema.documents).values(document(a.id)).returning();
  await db.insert(schema.documentChunks).values([{documentId:doc.id,userId:a.id,ordinal:0,page:1,text:'Filtration uptime stayed high.',embedding:vector(1),embeddingModel:'m'},{documentId:doc.id,userId:a.id,ordinal:1,page:2,text:'Budgets grew in the south region.',embedding:vector(-1),embeddingModel:'m'}]);
  const near=await pg.query<{page:number}>(`SELECT page FROM document_chunks ORDER BY embedding <=> $1::vector LIMIT 1`,[JSON.stringify(vector(.9))]);
  expect(near.rows[0].page).toBe(1);
  const keyword=await pg.query<{page:number}>(`SELECT page FROM document_chunks WHERE search_text @@ to_tsquery('english','budget')`);
  expect(keyword.rows.map(r=>r.page)).toEqual([2]);
});
it('deleting an owner removes their documents and chunks',async()=>{
  const a=await owner();const [doc]=await db.insert(schema.documents).values(document(a.id)).returning();
  await db.insert(schema.documentChunks).values({documentId:doc.id,userId:a.id,ordinal:0,page:1,text:'Private text'});
  await db.delete(schema.user).where(eq(schema.user.id,a.authSubject));
  expect(await db.select().from(schema.documents)).toHaveLength(0);expect(await db.select().from(schema.documentChunks)).toHaveLength(0);
});
it('accepts a Files run whose retrieval spends no search credits, and keeps web runs strict',async()=>{
  const person=await seedCompletion(db,50000n,'What does my report say?',2,undefined,'FAST');
  await db.update(schema.runs).set({mode:'DOCUMENTS'}).where(eq(schema.runs.id,person.runId));
  const base={runId:person.runId,attemptVersion:1,policyVersion:'v1',detectorVersion:'d',modelId:'m',createdAt:new Date(),expiresAt:new Date(Date.now()+86400000),queryVerdict:'ALLOW',evidenceVerdict:'ALLOW'};
  await expect(db.insert(schema.runRetrievals).values({...base,status:'READY',sourceKind:'DOCUMENTS',searchCredits:1})).rejects.toMatchObject(violation);
  await expect(db.insert(schema.runRetrievals).values({...base,status:'READY',sourceKind:'WEB',searchCredits:null})).rejects.toMatchObject(violation);
  await expect(db.insert(schema.runRetrievals).values({...base,status:'READY',sourceKind:'BOOKS'})).rejects.toMatchObject(violation);
  await db.insert(schema.runRetrievals).values({...base,status:'READY',sourceKind:'DOCUMENTS',searchCredits:null});
  const [source]=await db.insert(schema.runSources).values({runId:person.runId,sourceKey:'S1',url:'https://perplexity.jacked.dev/documents/x?page=3',title:'report.pdf, page 3',rank:1,retrievedAt:new Date()}).returning();
  const {hashPassage}=await import('@/server/search/evidence');
  await db.insert(schema.sourcePassages).values({id:randomUUID(),runId:person.runId,sourceId:source.id,text:'Page text',contentHash:hashPassage('Page text'),contentKind:'DOCUMENT_PAGE'});
  await expect(db.update(schema.runs).set({mode:'SPACES'}).where(eq(schema.runs.id,person.runId))).rejects.toMatchObject(violation);
});

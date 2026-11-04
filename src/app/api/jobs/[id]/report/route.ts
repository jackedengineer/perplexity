import {jobsHttp} from '@/server/jobs/service';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return jobsHttp.report(request,(await params).id);}

import {jobsHttp} from '@/server/jobs/service';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return jobsHttp.cancel(request,(await params).id);}

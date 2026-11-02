import {jobsHttp} from '@/server/jobs/service';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return jobsHttp.remove(request,(await params).id);}

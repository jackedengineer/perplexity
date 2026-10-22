import { recoveryHttp } from '@/server/runs/recovery-service';
export const runtime='nodejs';
export const maxDuration=15;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 return recoveryHttp.cancel(request,(await params).id);
}

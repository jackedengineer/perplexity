import { recoveryHttp } from '@/server/runs/recovery-service';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){return recoveryHttp.cron(request);}

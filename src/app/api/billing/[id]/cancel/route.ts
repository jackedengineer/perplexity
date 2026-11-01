import {paymentsHttp} from '@/server/payments/service';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return paymentsHttp.cancel(request,(await params).id);}

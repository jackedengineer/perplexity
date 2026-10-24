import {feedbackHttp} from '@/server/feedback/service';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return feedbackHttp.handle(request,(await context.params).id);}
export async function PUT(request:Request,context:Context){return feedbackHttp.handle(request,(await context.params).id);}

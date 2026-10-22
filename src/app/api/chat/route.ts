import { chatHttp } from "@/server/chat/service";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (request: Request)=>chatHttp.post(request);

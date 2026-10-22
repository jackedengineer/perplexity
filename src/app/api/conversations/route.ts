import { conversationHttp } from "@/server/conversations/service";

export const runtime = "nodejs";
export const GET = (request: Request) => conversationHttp.handle(request, "list");
export const POST = (request: Request) => conversationHttp.handle(request, "create");

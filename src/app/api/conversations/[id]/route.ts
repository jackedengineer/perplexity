import { conversationHttp } from "@/server/conversations/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return conversationHttp.handle(request, "get", (await context.params).id);
}
export async function PATCH(request: Request, context: Context) {
  return conversationHttp.handle(request, "rename", (await context.params).id);
}

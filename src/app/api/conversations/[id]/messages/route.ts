import { conversationHttp } from "@/server/conversations/service";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return conversationHttp.handle(request, "history", (await context.params).id);
}

import { conversationHttp } from "@/server/conversations/service";
export const PATCH = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  conversationHttp.handle(request, "pin", (await context.params).id);

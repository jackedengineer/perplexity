import { chatHttp } from "@/server/chat/service";
export const runtime = "nodejs";
export async function GET(request: Request,{ params }: { params: Promise<{id: string}> }) {
  return chatHttp.get(request,(await params).id);
}

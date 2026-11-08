import { documentsHttp } from "@/server/documents";
export const runtime = "nodejs";
export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  return documentsHttp.file(request, (await ctx.params).id);
}

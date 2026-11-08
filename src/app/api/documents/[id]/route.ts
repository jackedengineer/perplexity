import { documentsHttp } from "@/server/documents";
export const runtime = "nodejs";
export async function DELETE(request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  return documentsHttp.remove(request, (await ctx.params).id);
}

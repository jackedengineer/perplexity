// Citation links point here as /documents/<id>?page=N. The page number travels in the
// query because source links drop fragments; the browser's PDF viewer reads #page=N.
export const runtime = "nodejs";
export async function GET(request: Request, ctx: RouteContext<"/documents/[id]">) {
  const { id } = await ctx.params;
  const page = Number(new URL(request.url).searchParams.get("page"));
  const target = new URL(`/api/documents/${encodeURIComponent(id)}/file`, request.url);
  if (Number.isInteger(page) && page >= 1 && page <= 10_000) target.hash = `page=${page}`;
  return Response.redirect(target, 302);
}

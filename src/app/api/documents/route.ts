import { documentsHttp } from "@/server/documents";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (request: Request) => documentsHttp.list(request);
export const POST = (request: Request) => documentsHttp.upload(request);

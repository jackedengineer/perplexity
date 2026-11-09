import { memoryHttp } from "@/server/memory";
export const runtime = "nodejs";
export const GET = (request: Request) => memoryHttp.read(request);
export const PATCH = (request: Request) => memoryHttp.update(request);
export const DELETE = (request: Request) => memoryHttp.deleteAll(request);

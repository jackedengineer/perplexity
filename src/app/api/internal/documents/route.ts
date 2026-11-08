import { documentsCron } from "@/server/documents";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (request: Request) => documentsCron(request);

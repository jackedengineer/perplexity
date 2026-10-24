import {usageResponse} from '@/server/billing/http';
export const runtime='nodejs';
export async function GET(){return usageResponse();}

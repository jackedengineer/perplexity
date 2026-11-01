import {paymentsHttp} from '@/server/payments/service';
export const runtime='nodejs';
export const POST=paymentsHttp.webhook;

import {paymentsHttp} from '@/server/payments/service';
export const runtime='nodejs';
export const GET=paymentsHttp.status;

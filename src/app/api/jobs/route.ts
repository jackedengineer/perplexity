import {jobsHttp} from '@/server/jobs/service';
export const runtime='nodejs';
export const GET=jobsHttp.list;
export const POST=jobsHttp.submit;

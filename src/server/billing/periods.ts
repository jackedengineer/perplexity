import {getAttemptWindows} from '@/server/runs/windows';
export function freeWindows(now:Date) {
 const day=getAttemptWindows(now)[1],local=new Date(now.getTime()+330*60000);
 return {day:{startsAt:day.startsAt,endsAt:day.endsAt},period:{
  startsAt:new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),1)-330*60000),
  endsAt:new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,1)-330*60000),
 }};
}

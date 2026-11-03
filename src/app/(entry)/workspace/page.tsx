import { StartQuestion } from "@/components/conversations/question-composer";
import { Icon } from "@/components/conversations/icons";
import {getCurrentSession} from '@/lib/current-session';
import {VisitorQuestion} from '@/components/conversations/visitor-question';
import {requiresGuestChallenge} from '@/server/auth/challenge';

export const metadata = { title: "New conversation" };
export default async function Workspace() {
  const identity=await getCurrentSession();
  const challenge=requiresGuestChallenge(process.env.BETTER_AUTH_URL??'https://invalid');
  const guestEnabled=process.env.ENABLE_GUEST_TRIALS==='true'&&(!challenge||Boolean(process.env.TURNSTILE_SITE_KEY&&process.env.TURNSTILE_SECRET_KEY));
  return <main id="main" className="research-page">
    <div className="research-topbar home-topbar"><span className="private-pill">{identity&&<Icon name="lock" size={13} />}{identity?"Private workspace":"Workspace"}</span></div>
    {identity?<StartQuestion />:<VisitorQuestion guestEnabled={guestEnabled} siteKey={process.env.TURNSTILE_SITE_KEY}/>}
  </main>;
}

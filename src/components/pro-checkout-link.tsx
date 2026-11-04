import Link from 'next/link';
import {GoogleSignIn} from './google-sign-in';
export function ProCheckoutLink({signedIn}:{signedIn:boolean}) {
 return signedIn?<Link className="button pricing-checkout" href="/billing">Upgrade to Pro · ₹999 <span aria-hidden="true">↗</span></Link>
  :<GoogleSignIn destination="/billing" label="Sign in to upgrade · ₹999"/>;
}

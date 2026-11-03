import {redirect} from "next/navigation";

// Retain old bookmarks and authentication redirects without a second landing page.
export default async function SignIn({searchParams}: {searchParams:Promise<{error?:string}>}) {
  const {error}=await searchParams;
  redirect(error ? "/workspace?error=oauth" : "/workspace");
}

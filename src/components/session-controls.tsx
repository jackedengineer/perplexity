"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SessionControls() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let lastCheck = 0;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now();
      try {
        const { data, error } = await authClient.getSession();
        if (active && !error && !data) router.replace("/sign-in");
      } catch { /* A temporary outage must not pretend to be a logout. */ }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 5 * 60_000);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [router]);
  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed");
      router.replace("/sign-in");
      router.refresh();
    } catch { setFailed(true); setPending(false); }
  }
  return <div>
    <button className="text-button" onClick={signOut} disabled={pending}>{pending ? "Signing out…" : "Sign out"}</button>
    {failed && <p className="inline-error" role="alert">Couldn’t sign out. Try again.</p>}
  </div>;
}

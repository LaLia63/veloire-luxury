"use client";

import { LogIn } from "lucide-react";
import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-client";
import { Modal } from "./modal";

export function AuthModal({ open, onClose, intent = "continue" }: { open: boolean; onClose: () => void; intent?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const signIn = async () => {
    setLoading(true); setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`;
    const { error: authError } = await getSupabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo, queryParams: { access_type: "offline", prompt: "consent" } } });
    if (authError) { setError("Authentication could not be started. Please try again."); setLoading(false); }
  };
  return <Modal open={open} onClose={onClose} className="auth-modal"><p className="eyebrow dark">Private access</p><h2>Enter the<br/><em>Maison</em></h2><p>Sign in to {intent}, preserve your bag, collect VÉLOIRE Privilege points and follow every order from atelier to arrival.</p><button className="primary-button" onClick={signIn} disabled={loading}><LogIn />{loading ? "Preparing sign in…" : "Continue with Google"}</button>{error && <p className="form-error">{error}</p>}<small>By continuing, you agree to our privacy and purchase terms.</small></Modal>;
}

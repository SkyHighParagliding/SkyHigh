import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, LogIn, UserPlus, KeyRound } from "lucide-react";
import { usePilotAuth } from "@/contexts/PilotAuthContext";

interface PilotLoginModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  portalContainer?: HTMLElement | null;
}

export function PilotLoginModal({ onClose, onSuccess, portalContainer }: PilotLoginModalProps) {
  const { login, register } = usePilotAuth();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const maps = document.querySelectorAll<HTMLElement>('.leaflet-container');
    maps.forEach(m => { m.style.pointerEvents = 'none'; m.style.touchAction = 'none'; });
    document.body.style.overflow = 'hidden';
    return () => {
      maps.forEach(m => { m.style.pointerEvents = ''; m.style.touchAction = ''; });
      document.body.style.overflow = '';
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        onClose();
        onSuccess?.();
      } else if (mode === "register") {
        await register(email, password, firstName, lastName);
        onClose();
        onSuccess?.();
      } else if (mode === "forgot") {
        const res = await fetch("/api/auth/request-pilot-password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Something went wrong");
        } else {
          setForgotSuccess("If an account exists with that email, a password reset link has been sent.");
        }
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      style={{ touchAction: 'auto' } as React.CSSProperties}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm"
        style={{ touchAction: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">
            {mode === "login" ? "Pilot Login" : mode === "register" ? "Create Pilot Account" : "Reset Password"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
          )}

          {forgotSuccess && (
            <div className="text-sm text-green-700 bg-green-50 p-2 rounded">{forgotSuccess}</div>
          )}

          {mode === "register" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                style={{ touchAction: 'manipulation', fontSize: '16px' }}
              />
              <input
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                style={{ touchAction: 'manipulation', fontSize: '16px' }}
              />
            </div>
          )}

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            style={{ touchAction: 'manipulation', fontSize: '16px' }}
          />

          {mode !== "forgot" && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="current-password"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              style={{ touchAction: 'manipulation', fontSize: '16px' }}
            />
          )}

          {!forgotSuccess && (
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {mode === "login" ? (
                <>
                  <LogIn className="w-4 h-4" /> Sign In
                </>
              ) : mode === "register" ? (
                <>
                  <UserPlus className="w-4 h-4" /> Create Account
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" /> Send Reset Link
                </>
              )}
            </button>
          )}

          <div className="text-xs text-center text-gray-500 space-y-1">
            {mode === "login" && (
              <>
                <p>
                  <button
                    type="button"
                    onClick={() => { setMode("forgot"); setError(""); setForgotSuccess(""); }}
                    className="text-sky-500 hover:underline"
                  >
                    Forgot password?
                  </button>
                </p>
                <p>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("register"); setError(""); }}
                    className="text-sky-500 hover:underline"
                  >
                    Sign up
                  </button>
                </p>
              </>
            )}
            {mode === "register" && (
              <p>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(""); }}
                  className="text-sky-500 hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}
            {mode === "forgot" && (
              <p>
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(""); setForgotSuccess(""); }}
                  className="text-sky-500 hover:underline"
                >
                  Back to sign in
                </button>
              </p>
            )}
          </div>
          {mode !== "forgot" && (
            <p className="text-xs text-center text-gray-400">
              Sign in to save your flights permanently
            </p>
          )}
        </form>
      </div>
    </div>,
    portalContainer || document.fullscreenElement || document.body
  );
}

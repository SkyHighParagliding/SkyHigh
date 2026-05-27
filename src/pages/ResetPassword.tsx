import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KeyRound, CheckCircle, AlertTriangle } from "lucide-react";
import { api } from "@/lib/apiClient";

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "success">("loading");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState<string>("contact");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      setError("No reset token provided");
      return;
    }

    api.get<{
      valid: boolean;
      name?: string;
      email?: string;
      accountType?: string;
      error?: string;
    }>(`/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`)
      .then(data => {
        if (data.valid) {
          setStatus("valid");
          setName(data.name || "");
          setEmail(data.email || "");
          setAccountType(data.accountType || "contact");
        } else {
          setStatus("invalid");
          setError(data.error || "Invalid reset link");
        }
      })
      .catch(() => {
        setStatus("invalid");
        setError("Unable to validate reset link");
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const data = await api.post<{ success?: boolean }>("/api/auth/reset-password", { token, password });
      if (data.success) {
        setStatus("success");
      } else {
        setError("Failed to reset password");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy" />
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md shadow-xl border-t-4 border-t-red-500">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <CardTitle className="text-2xl text-red-700">Invalid Link</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-6">{error}</p>
            <p className="text-sm text-muted-foreground">
              Contact a committee member to request a new password reset.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md shadow-xl border-t-4 border-t-green-500">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-700">Password Set</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-6">
              Your password has been updated successfully. You can now log in with your new password.
            </p>
            <Link to={accountType === "pilot" ? "/" : "/admin"}>
              <Button className="bg-navy hover:bg-navy-light text-white">
                {accountType === "pilot" ? "Return to Site" : "Go to Admin Login"}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen flex items-center justify-center py-12 px-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-navy">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-navy/10 rounded-full flex items-center justify-center mb-4">
            <KeyRound className="w-8 h-8 text-navy" />
          </div>
          <CardTitle className="text-2xl text-navy">Set Your Password</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            {name && <>Hi {name} — </>}choose a password for your account
          </p>
          {email && (
            <p className="text-xs text-muted-foreground mt-1">{email}</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground-label">New Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full p-3 border border-border rounded-lg focus:ring-1 focus:ring-sky focus:border-sky"
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground-label">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full p-3 border border-border rounded-lg focus:ring-1 focus:ring-sky focus:border-sky"
                placeholder="Re-enter your password"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-navy hover:bg-navy-light text-white h-12 text-base"
              disabled={submitting}
            >
              {submitting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              ) : (
                "Set Password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

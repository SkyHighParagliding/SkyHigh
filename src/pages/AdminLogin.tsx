import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, LogIn, Mail, ArrowLeft, UserPlus, Camera } from "lucide-react";
import { api } from "@/lib/apiClient";
import { PhotoUploadDialog } from "@/components/PhotoUploadDialog";

type View = "login" | "forgot" | "first-time" | "provider-signup" | "photo-upload";

export function AdminLogin() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [successMessage, setSuccessMessage] = useState("");
  const [providerName, setProviderName] = useState("");
  const [providerEmail, setProviderEmail] = useState("");
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [photoEmail, setPhotoEmail] = useState("");
  const [photoPassword, setPhotoPassword] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/admin");
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const err = await login(email, password);
    if (err) {
      setError(err);
      setFailCount((prev) => prev + 1);
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const data = await api.post<{ message?: string }>("/api/auth/request-password-reset", { email, mode: view === "first-time" ? "first-time" : "forgot" });
      setSuccessMessage(data.message || "If an account exists with that email, a password reset link has been sent.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleProviderSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const data = await api.post<{ message?: string }>("/api/auth/register-provider", { name: providerName, email: providerEmail });
      setSuccessMessage(data.message || "Account created! Check your email to set your password.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const switchView = (newView: View) => {
    setView(newView);
    setError("");
    setSuccessMessage("");
    setLoading(false);
  };

  const handlePhotoUpload = async (imageBuffer: string) => {
    setPhotoLoading(true);
    try {
      const res = await fetch("/api/contacts/photo/self-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: photoEmail,
          password: photoPassword,
          imageBuffer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setSuccessMessage("Photo uploaded successfully!");
      setShowPhotoDialog(false);
      setTimeout(() => switchView("login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPhotoLoading(false);
    }
  };

  if (view === "forgot" || view === "first-time") {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md shadow-xl border-t-4 border-t-navy">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-navy/10 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-navy" />
            </div>
            <CardTitle className="text-2xl text-navy">
              {view === "forgot" ? "Forgot Password?" : "First Time? Set Your Password"}
            </CardTitle>
            <p className="text-muted-foreground text-sm mt-1">
              {view === "forgot"
                ? "Enter your email and we'll send you a link to reset your password"
                : "Enter your email to receive a link to set up your password"}
            </p>
          </CardHeader>
          <CardContent>
            {successMessage ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  {successMessage}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => switchView("login")}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleRequestReset} className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground-label">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-3 border border-border rounded-lg focus:ring-sky focus:border-sky"
                    placeholder="your@email.com"
                    required
                    autoFocus
                  />
                </div>

                {view === "first-time" && (
                  <p className="text-xs text-muted-foreground">
                    This is for existing members whose accounts were created by an admin or synced from TidyHQ. If you don't have an account, use the Provider Sign Up option instead.
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full bg-navy hover:bg-navy-light text-white h-12 text-base"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  ) : (
                    <>
                      <Mail className="w-5 h-5 mr-2" /> Send Reset Link
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => switchView("login")}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === "provider-signup") {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md shadow-xl border-t-4 border-t-navy">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-navy/10 rounded-full flex items-center justify-center mb-4">
              <UserPlus className="w-8 h-8 text-navy" />
            </div>
            <CardTitle className="text-2xl text-navy">Sign Up as Provider</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">
              Create a provider account to get started
            </p>
          </CardHeader>
          <CardContent>
            {successMessage ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  {successMessage}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => switchView("login")}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleProviderSignup} className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground-label">Full Name</label>
                  <input
                    type="text"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    className="w-full p-3 border border-border rounded-lg focus:ring-sky focus:border-sky"
                    placeholder="Your full name"
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground-label">Email</label>
                  <input
                    type="email"
                    value={providerEmail}
                    onChange={(e) => setProviderEmail(e.target.value)}
                    className="w-full p-3 border border-border rounded-lg focus:ring-sky focus:border-sky"
                    placeholder="your@email.com"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-navy hover:bg-navy-light text-white h-12 text-base"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  ) : (
                    <>
                      <UserPlus className="w-5 h-5 mr-2" /> Create Account
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => switchView("login")}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === "photo-upload") {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md shadow-xl border-t-4 border-t-sky">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-sky/10 rounded-full flex items-center justify-center mb-4">
              <Camera className="w-8 h-8 text-sky" />
            </div>
            <CardTitle className="text-2xl text-navy">Update Your Photo</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">
              Upload a passport-style photo to your committee profile
            </p>
          </CardHeader>
          <CardContent>
            {successMessage ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  {successMessage}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground-label">Email</label>
                  <input
                    type="email"
                    value={photoEmail}
                    onChange={(e) => setPhotoEmail(e.target.value)}
                    className="w-full p-3 border border-border rounded-lg focus:ring-sky focus:border-sky"
                    placeholder="your@email.com"
                    disabled={showPhotoDialog}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground-label">Password</label>
                  <input
                    type="password"
                    value={photoPassword}
                    onChange={(e) => setPhotoPassword(e.target.value)}
                    className="w-full p-3 border border-border rounded-lg focus:ring-sky focus:border-sky"
                    placeholder="Enter your password"
                    disabled={showPhotoDialog}
                  />
                </div>

                <Button
                  onClick={() => setShowPhotoDialog(true)}
                  disabled={!photoEmail || !photoPassword || photoLoading}
                  className="w-full bg-sky hover:bg-sky-dark text-white"
                >
                  <Camera className="w-4 h-4 mr-2" /> Select Photo
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => switchView("login")}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <PhotoUploadDialog
          isOpen={showPhotoDialog}
          onClose={() => setShowPhotoDialog(false)}
          onUpload={handlePhotoUpload}
          isLoading={photoLoading}
          contactName="your profile"
        />
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen flex items-center justify-center py-12 px-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-navy">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-navy/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-navy" />
          </div>
          <CardTitle className="text-2xl text-navy">Admin Login</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">Sign in to access the admin dashboard</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            {failCount >= 3 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                Having trouble? Try <button type="button" className="underline font-medium" onClick={() => switchView("forgot")}>resetting your password</button>.
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-border rounded-lg focus:ring-sky focus:border-sky"
                placeholder="your@email.com"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-border rounded-lg focus:ring-sky focus:border-sky"
                placeholder="Enter your password"
                required
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs text-sky hover:text-navy transition-colors"
                  onClick={() => switchView("forgot")}
                  tabIndex={-1}
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-navy hover:bg-navy-light text-white h-12 text-base"
              disabled={loading}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              ) : (
                <>
                  <LogIn className="w-5 h-5 mr-2" /> Sign In
                </>
              )}
            </Button>

            <div className="pt-2 border-t border-border space-y-2">
              <button
                type="button"
                className="w-full text-sm text-sky hover:text-navy transition-colors py-1"
                onClick={() => switchView("first-time")}
              >
                First time? Set your password
              </button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-navy transition-colors py-1"
                onClick={() => switchView("provider-signup")}
              >
                Sign up as Provider
              </button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-navy transition-colors py-1"
                onClick={() => switchView("photo-upload")}
              >
                <Camera className="w-3.5 h-3.5 inline mr-1" /> Update your photo
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

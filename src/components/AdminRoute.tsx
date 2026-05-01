import { lazy, Suspense } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

const AdminLogin = lazy(() => import("@/pages/AdminLogin").then(m => ({ default: m.AdminLogin })));

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, isSoSession, soSiteId, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky"></div></div>}><AdminLogin /></Suspense>;
  }

  if (isSoSession) {
    return <Navigate to={`/sites/${soSiteId}`} replace />;
  }

  return <>{children}</>;
}

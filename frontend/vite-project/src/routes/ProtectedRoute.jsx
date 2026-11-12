import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

/**
 * ProtectedRoute — guards a route by role AND/OR permission.
 *
 * Props:
 *   roles          — array of role strings required (any one match grants access)
 *   permissions    — array of permission codes required (any one match grants access)
 *
 * Access is granted if:
 *   • No roles and no permissions are specified (open to any authenticated user)
 *   • User matches any of the given roles
 *   • User has any of the given permissions (extra permissions granted by admin)
 *   • User is a System Admin (always passes)
 */
export default function ProtectedRoute({
  children,
  roles = [],
  permissions = [],
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-xl font-semibold">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Open route — any authenticated user
  if (roles.length === 0 && permissions.length === 0) {
    return children;
  }

  // System admins always pass every gate
  if (user.isSAdmin || user.role === "SYSTEM_ADMIN" || user.userType === "SYSTEM_ADMIN") {
    return children;
  }

  // ── Role check ───────────────────────────────────────────────────────────
  if (roles.length > 0) {
    const roleMatches =
      (roles.includes("MANAGER")    && (user.isManager   || user.role === "MANAGER"    || user.userType === "MANAGER"    || user.managerType)) ||
      (roles.includes("DIRECTOR")   && (user.isDirector  || user.role === "DIRECTOR"   || user.userType === "DIRECTOR"))  ||
      (roles.includes("PS_SUPPORT") && (user.isPSsupport || user.role === "PS_SUPPORT" || user.userType === "PS_SUPPORT")) ||
      (roles.includes("CUSTOMER")   && user.partyType === "CUSTOMER");

    if (roleMatches) return children;
  }

  // ── Permission check (extra permissions granted by admin) ────────────────
  if (permissions.length > 0) {
    const userPerms = Array.isArray(user.permissions)
      ? user.permissions.map((p) => String(p).trim().toUpperCase())
      : [];

    const permMatches = permissions.some((p) =>
      userPerms.includes(String(p).trim().toUpperCase())
    );

    if (permMatches) return children;
  }

  return <Navigate to="/unauthorized" replace />;
}

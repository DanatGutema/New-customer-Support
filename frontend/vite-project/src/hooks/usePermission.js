import { useAuth } from "../context/useAuth";

/**
 * Returns true if the current user has at least one of the given permission codes.
 * System Admins always return true.
 *
 * Usage:
 *   const canAssign = usePermission("CASE_ASSIGN");
 *   const canView   = usePermission("CASE_READ_ALL", "CASE_READ_HIERARCHY");
 */
export function usePermission(...codes) {
  const { user } = useAuth();

  if (!user) return false;

  // System admins bypass all permission checks
  if (user.isSAdmin) return true;

  const userPermissions = Array.isArray(user.permissions)
    ? user.permissions.map((p) => String(p).trim().toUpperCase())
    : [];

  return codes.some((code) =>
    userPermissions.includes(String(code).trim().toUpperCase())
  );
}

export default usePermission;

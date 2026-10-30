import { can, useAuth } from '@/src/auth/AuthProvider';

/** Web `useAuth().hasRole / hasPermission` karşılığı; super_admin her izni taşır. */
export function useAdminAccess() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const isSuperAdmin = roles.includes('super_admin');
  const isAdmin = isSuperAdmin || roles.includes('admin');
  return {
    user,
    isSuperAdmin,
    isAdmin,
    has: (permission: string) => can(user, permission),
  };
}

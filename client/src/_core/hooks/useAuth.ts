import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();
  const currentQuery = trpc.auth.current.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => utils.auth.current.invalidate(),
  });
  const employee = currentQuery.data?.employee ?? null;

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (!(error instanceof TRPCClientError) || error.data?.code !== "UNAUTHORIZED") throw error;
    } finally {
      if (typeof window !== "undefined") window.location.replace("/");
    }
  }, [logoutMutation]);

  const state = useMemo(() => ({
    user: employee ? {
      id: employee.id,
      name: employee.displayName,
      email: null,
      role: employee.role,
      username: employee.username,
    } : null,
    loading: currentQuery.isLoading || logoutMutation.isPending,
    error: currentQuery.error ?? logoutMutation.error ?? null,
    isAuthenticated: Boolean(employee),
  }), [employee, currentQuery.error, currentQuery.isLoading, logoutMutation.error, logoutMutation.isPending]);

  useEffect(() => {
    if (!redirectOnUnauthenticated || state.loading || state.user || !redirectPath) return;
    if (typeof window !== "undefined" && window.location.pathname !== redirectPath) {
      window.location.replace(redirectPath);
    }
  }, [redirectOnUnauthenticated, redirectPath, state.loading, state.user]);

  return {
    ...state,
    refresh: () => currentQuery.refetch(),
    logout,
  };
}

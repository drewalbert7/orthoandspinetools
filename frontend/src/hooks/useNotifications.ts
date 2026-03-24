import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';

export const notificationQueryKeys = {
  root: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
  list: (page: number) => ['notifications', 'list', page] as const,
};

/**
 * Unread badge + list panel for the header bell.
 * @param panelOpen When true, fetches the first page of notifications.
 */
export function useNotifications(panelOpen: boolean, userLoggedIn: boolean) {
  const queryClient = useQueryClient();

  const unreadQuery = useQuery({
    queryKey: notificationQueryKeys.unread,
    queryFn: () => apiService.getUnreadNotificationCount(),
    enabled: userLoggedIn,
    staleTime: 20_000,
    refetchInterval: userLoggedIn ? 45_000 : false,
  });

  const listQuery = useQuery({
    queryKey: notificationQueryKeys.list(1),
    queryFn: () => apiService.getNotifications(1, 25),
    enabled: userLoggedIn && panelOpen,
    staleTime: 15_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiService.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.root });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiService.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.root });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiService.deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.root });
    },
  });

  return {
    unreadCount: unreadQuery.data ?? 0,
    notifications: listQuery.data?.items ?? [],
    total: listQuery.data?.total ?? 0,
    isLoadingList: listQuery.isLoading,
    listError: listQuery.error,
    refetchUnread: unreadQuery.refetch,
    markRead,
    markAllRead,
    remove,
  };
}

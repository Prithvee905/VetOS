"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/api";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const unread = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: getUnreadNotificationCount,
    refetchInterval: 30_000,
  });

  const list = useQuery({
    queryKey: ["notifications", 0],
    queryFn: () => listNotifications(0, 15),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const count = unread.data ?? 0;

  return (
    <div className="relative">
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        🔔{count > 0 ? ` (${count})` : ""}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-bold uppercase text-slate-500">Notifications</span>
            <button type="button" className="text-xs text-teal-700 font-semibold" onClick={() => markAll.mutate()}>
              Mark all read
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {(list.data?.items ?? []).map((n: AppNotification) => (
              <li key={n.id} className="px-3 py-2 text-xs">
                <p className="font-semibold text-slate-800">{n.title}</p>
                <p className="text-slate-600 mt-0.5">{n.body}</p>
                {!n.readAt && (
                  <button
                    type="button"
                    className="mt-1 text-teal-700 font-semibold"
                    onClick={() => markRead.mutate(n.id)}
                  >
                    Mark read
                  </button>
                )}
              </li>
            ))}
            {(list.data?.items ?? []).length === 0 && (
              <li className="px-3 py-6 text-center text-slate-400">No notifications</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

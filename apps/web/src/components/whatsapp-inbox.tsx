"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { listWhatsAppInbox, markInboxMessageRead, sendWhatsApp, type InboxMessage } from "@/lib/api";

const ACTION_LABELS: Record<string, { label: string; className: string }> = {
  CONFIRMED_APPOINTMENT: { label: "Appointment confirmed", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  CANCEL_REQUESTED: { label: "Wants to cancel — call client", className: "bg-amber-100 text-amber-900 border-amber-300" },
  BOOKING: { label: "Booking chat", className: "bg-sky-100 text-sky-800 border-sky-200" },
  BOOKED: { label: "Booked via WhatsApp", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

/** Clients' WhatsApp messages to the clinic, newest first, with a reply box (free text within 24 hours). */
export function WhatsAppInbox() {
  const queryClient = useQueryClient();
  const [replyingTo, setReplyingTo] = useState<InboxMessage | null>(null);
  const [replyText, setReplyText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const inbox = useQuery({ queryKey: ["whatsapp-inbox"], queryFn: () => listWhatsAppInbox(100), refetchInterval: 15_000 });
  const unread = useMemo(() => (inbox.data ?? []).filter((m) => !m.readAt).length, [inbox.data]);

  const markRead = useMutation({
    mutationFn: (id: string) => markInboxMessageRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox"] }),
  });

  const sendReply = useMutation({
    mutationFn: () =>
      sendWhatsApp({
        to: replyingTo?.fromPhone ?? "",
        template: "SESSION",
        body: replyText.trim(),
        sessionMessage: true,
      }),
    onSuccess: () => {
      setNotice(`Reply queued to ${replyingTo?.clientName || replyingTo?.fromPhone}. Check the outbox for delivery.`);
      setReplyText("");
      setReplyingTo(null);
      queryClient.invalidateQueries({ queryKey: ["outbox-events"] });
    },
    onError: (err) => setNotice(err instanceof Error ? err.message : "Could not send the reply."),
  });

  const within24h = (m: InboxMessage) => Date.now() - new Date(m.receivedAt).getTime() < 24 * 60 * 60 * 1000;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-700" />
            WhatsApp Inbox
            {unread > 0 && (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">{unread} new</span>
            )}
          </h3>
          <p className="text-xs text-slate-500">
            Replies from clients. &quot;Yes&quot; confirms their next appointment automatically; cancellations are flagged for you.
          </p>
        </div>
      </div>

      {notice && <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">{notice}</p>}

      {inbox.isLoading ? (
        <p className="py-6 text-center text-xs text-slate-400">Loading messages…</p>
      ) : (inbox.data ?? []).length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">No messages from clients yet.</p>
      ) : (
        <div className="mt-2 max-h-96 divide-y divide-slate-100 overflow-y-auto">
          {(inbox.data ?? []).map((m) => {
            const action = m.handledAction ? ACTION_LABELS[m.handledAction] : undefined;
            return (
              <div key={m.id} className={`py-3 ${m.readAt ? "" : "bg-emerald-50/40"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-semibold text-slate-900">{m.clientName || "Unknown number"}</span>
                    <span className="ml-2 text-xs text-slate-500">+{m.fromPhone}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {new Date(m.receivedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{m.body || `(${m.messageType} message)`}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {action && (
                    <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${action.className}`}>{action.label}</span>
                  )}
                  {within24h(m) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingTo(m);
                        setNotice(null);
                        if (!m.readAt) markRead.mutate(m.id);
                      }}
                      className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Reply
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">Over 24 hours old — reply with a template instead</span>
                  )}
                  {!m.readAt && (
                    <button
                      type="button"
                      onClick={() => markRead.mutate(m.id)}
                      className="text-[11px] font-semibold text-slate-500 underline"
                    >
                      Mark read
                    </button>
                  )}
                </div>
                {replyingTo?.id === m.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type a reply…"
                      aria-label={`Reply to ${m.clientName || m.fromPhone}`}
                      className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      disabled={!replyText.trim() || sendReply.isPending}
                      onClick={() => sendReply.mutate()}
                      className="flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sendReply.isPending ? "Sending…" : "Send"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

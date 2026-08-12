import { api } from "@/shared/api/base";

export type NotificationType =
  | "request_created"
  | "request_assigned"
  | "request_status"
  | "request_message"
  | "system";

export interface NotificationOut {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  channel: string;
  is_read: boolean;
  payload: { request_id?: number; tracking_no?: string; [k: string]: unknown };
  created_at: string;
  read_at: string | null;
}

export const notificationsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listNotifications: build.query<NotificationOut[], { unread_only?: boolean; limit?: number } | void>(
      {
        query: (params) => ({ url: "/notifications", params: params || undefined }),
        providesTags: [{ type: "Notification", id: "LIST" }],
      },
    ),
    markNotificationRead: build.mutation<NotificationOut, number>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: "PATCH" }),
      invalidatesTags: [{ type: "Notification", id: "LIST" }],
    }),
    markAllNotificationsRead: build.mutation<void, void>({
      query: () => ({ url: "/notifications/read-all", method: "PATCH" }),
      invalidatesTags: [{ type: "Notification", id: "LIST" }],
    }),
  }),
});

export const {
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi;

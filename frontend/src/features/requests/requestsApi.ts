import { api } from "@/shared/api/base";

export type RequestStatus =
  | "new"
  | "accepted"
  | "in_progress"
  | "completed"
  | "rejected"
  | "returned";

export interface UserMini {
  id: number;
  full_name: string;
  email: string | null;
}

export interface RequestCategoryOut {
  id: number;
  parent_id: number | null;
  name: string;
  sla_hours: number;
  priority: string;
  is_active: boolean;
  icon: string | null;
}

/** Envelope returned by every paginated list endpoint (C-06). */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface RequestSummary {
  id: number;
  tracking_no: string;
  title: string;
  status: RequestStatus;
  priority: string;
  category_id: number;
  student_id: number;
  assigned_to: number | null;
  faculty_id: number | null;
  department_id: number | null;
  sla_deadline: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  /** Computed server-side: open and past its SLA deadline. */
  is_overdue: boolean;
}

export interface RequestHistoryOut {
  id: number;
  request_id: number;
  changed_by: number | null;
  old_status: string | null;
  new_status: string;
  comment: string | null;
  created_at: string;
  /** Resolved server-side so the timeline can name the actor, not their id. */
  changed_by_name: string | null;
  changed_by_role: string | null;
}

export interface RequestFileOut {
  id: number;
  request_id: number;
  uploaded_by: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface MessageOut {
  id: number;
  request_id: number;
  sender_id: number;
  content: string;
  is_internal: boolean;
  created_at: string;
  /** Resolved server-side so the thread shows who wrote each message. */
  sender_name: string | null;
  sender_role: string | null;
}

export interface RequestDetail extends RequestSummary {
  description: string;
  category: RequestCategoryOut;
  /** Parent type of `category`, for showing "Xizmat turi → Xizmat". */
  service_type: RequestCategoryOut | null;
  student: UserMini;
  assignee: UserMini | null;
  history: RequestHistoryOut[];
  files: RequestFileOut[];
  messages: MessageOut[];
}

/**
 * No `assigned_to`: the handler is chosen server-side from the student's
 * faculty, so the student never picks a registrator.
 */
export interface RequestCreatePayload {
  /** The chosen leaf service. */
  category_id: number;
  /** Its service type — cross-checked server-side against the service. */
  service_type_id?: number;
  title: string;
  description: string;
}

export interface AssigneeOut {
  id: number;
  full_name: string;
  role: { id: number; name: string; description: string | null };
  faculty_id: number | null;
  department_id: number | null;
}

export interface RequestAssignPayload {
  assignee_id: number;
  faculty_id?: number | null;
  department_id?: number | null;
  comment?: string | null;
}

export interface RequestTransitionPayload {
  status: RequestStatus;
  comment?: string | null;
}

export interface RequestListParams {
  status?: RequestStatus;
  faculty_id?: number;
  category_id?: number;
  assigned_to?: number;
  /** Only requests with no owner yet — the registrator's triage queue. */
  unassigned?: boolean;
  overdue?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export const requestsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listAssignees: build.query<AssigneeOut[], { faculty_id?: number } | void>({
      query: (params) => ({ url: "/users/assignees", params: params || undefined }),
    }),
    listRequests: build.query<Page<RequestSummary>, RequestListParams | void>({
      query: (params) => ({ url: "/requests", params: params || undefined }),
      providesTags: (res) =>
        res
          ? [
              ...res.items.map((r) => ({ type: "Request" as const, id: r.id })),
              { type: "Request" as const, id: "LIST" },
            ]
          : [{ type: "Request" as const, id: "LIST" }],
    }),
    getRequest: build.query<RequestDetail, number>({
      query: (id) => `/requests/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Request", id }],
    }),
    createRequest: build.mutation<RequestDetail, RequestCreatePayload>({
      query: (body) => ({ url: "/requests", method: "POST", body }),
      invalidatesTags: [
        { type: "Request", id: "LIST" },
        { type: "Stats", id: "DASHBOARD" },
      ],
    }),
    assignRequest: build.mutation<
      RequestDetail,
      { id: number; data: RequestAssignPayload }
    >({
      query: ({ id, data }) => ({
        url: `/requests/${id}/assign`,
        method: "POST",
        body: data,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Request", id },
        { type: "Request", id: "LIST" },
        { type: "Stats", id: "DASHBOARD" },
      ],
    }),
    transitionRequest: build.mutation<
      RequestDetail,
      { id: number; data: RequestTransitionPayload }
    >({
      query: ({ id, data }) => ({
        url: `/requests/${id}/transition`,
        method: "POST",
        body: data,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Request", id },
        { type: "Request", id: "LIST" },
        { type: "Stats", id: "DASHBOARD" },
      ],
    }),
    addMessage: build.mutation<
      MessageOut,
      { id: number; content: string; is_internal?: boolean }
    >({
      query: ({ id, content, is_internal = false }) => ({
        url: `/requests/${id}/messages`,
        method: "POST",
        body: { content, is_internal },
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Request", id }],
    }),
    uploadRequestFile: build.mutation<
      RequestFileOut,
      { id: number; file: File }
    >({
      query: ({ id, file }) => {
        const form = new FormData();
        form.append("upload", file);
        return {
          url: `/requests/${id}/files`,
          method: "POST",
          body: form,
        };
      },
      invalidatesTags: (_r, _e, { id }) => [{ type: "Request", id }],
    }),
  }),
});

export const {
  useListAssigneesQuery,
  useListRequestsQuery,
  useGetRequestQuery,
  useCreateRequestMutation,
  useAssignRequestMutation,
  useTransitionRequestMutation,
  useAddMessageMutation,
  useUploadRequestFileMutation,
} = requestsApi;

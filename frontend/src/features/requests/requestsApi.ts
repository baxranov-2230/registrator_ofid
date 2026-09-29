import { api } from "@/shared/api/base";

/**
 * `accepted` and `rejected` come from the earlier triage flow. Nothing moves a
 * request into them any more, but older rows still carry them.
 */
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
  description: string | null;
  sla_hours: number;
  priority: string;
  routing: string;
  auto_reply_text: string | null;
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
  /** Set while the request is returned to the student: the SLA is paused. */
  sla_paused_at: string | null;
  /** Idempotency key the partner platform submitted the request with. */
  client_ref: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  /** Computed server-side: SLA running and past its deadline. */
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
  /** Sent with the final answer rather than during the conversation. */
  is_answer: boolean;
  created_at: string;
}

/** The final answer — what closed the request and what the student reads. */
export interface RequestAnswerOut {
  text: string;
  answered_at: string;
  answered_by: number | null;
  answered_by_name: string | null;
  files: RequestFileOut[];
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
  /** Parent type of `category`, for showing "Murojaat turi → Xizmat turi". */
  service_type: RequestCategoryOut | null;
  student: UserMini;
  assignee: UserMini | null;
  history: RequestHistoryOut[];
  files: RequestFileOut[];
  messages: MessageOut[];
  answer: RequestAnswerOut | null;
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
    /** "Javob berish": the final answer with optional files; closes the request. */
    answerRequest: build.mutation<
      RequestDetail,
      { id: number; text: string; files: File[] }
    >({
      query: ({ id, text, files }) => {
        const form = new FormData();
        form.append("text", text);
        files.forEach((f) => form.append("files", f));
        return { url: `/requests/${id}/answer`, method: "POST", body: form };
      },
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Request", id },
        { type: "Request", id: "LIST" },
        { type: "Stats", id: "DASHBOARD" },
      ],
    }),
    /**
     * Download through the shared base query so an expired access token is
     * refreshed like on any other call. The blob becomes an object URL here,
     * because a Blob is not serialisable and cannot sit in the store.
     */
    downloadRequestFile: build.mutation<string, { id: number; fileId: number }>({
      query: ({ id, fileId }) => ({
        url: `/requests/${id}/files/${fileId}`,
        responseHandler: async (response: Response) =>
          response.ok ? URL.createObjectURL(await response.blob()) : response.json(),
      }),
    }),
  }),
});

export const {
  useListAssigneesQuery,
  useListRequestsQuery,
  useGetRequestQuery,
  useAssignRequestMutation,
  useTransitionRequestMutation,
  useAnswerRequestMutation,
  useDownloadRequestFileMutation,
} = requestsApi;

import { api } from "@/shared/api/base";
import type { CategoryNode } from "@/features/admin/adminApi";

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
}

export interface RequestHistoryOut {
  id: number;
  request_id: number;
  changed_by: number | null;
  old_status: string | null;
  new_status: string;
  comment: string | null;
  created_at: string;
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
}

export interface RequestDetail extends RequestSummary {
  description: string;
  closed_at: string | null;
  category: RequestCategoryOut;
  student: UserMini;
  assignee: UserMini | null;
  history: RequestHistoryOut[];
  files: RequestFileOut[];
  messages: MessageOut[];
}

export interface RequestCreatePayload {
  category_id: number;
  title: string;
  description: string;
  assigned_to?: number | null;
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
  search?: string;
  limit?: number;
  offset?: number;
}

export const requestsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listAssignees: build.query<AssigneeOut[], { faculty_id?: number } | void>({
      query: (params) => ({ url: "/users/assignees", params: params || undefined }),
    }),
    listRequests: build.query<RequestSummary[], RequestListParams | void>({
      query: (params) => ({ url: "/requests", params: params || undefined }),
      providesTags: (res) =>
        res
          ? [
              ...res.map((r) => ({ type: "Request" as const, id: r.id })),
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
      invalidatesTags: [{ type: "Request", id: "LIST" }],
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

export function flattenCategories(
  nodes: CategoryNode[],
  level = 0,
): Array<{ id: number; name: string; priority: string; sla_hours: number; level: number }> {
  const out: Array<{ id: number; name: string; priority: string; sla_hours: number; level: number }> = [];
  for (const n of nodes) {
    if (n.is_active) {
      out.push({ id: n.id, name: n.name, priority: n.priority, sla_hours: n.sla_hours, level });
    }
    if (n.children?.length) {
      out.push(...flattenCategories(n.children, level + 1));
    }
  }
  return out;
}

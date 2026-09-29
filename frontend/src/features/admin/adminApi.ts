import { api } from "@/shared/api/base";
import type { AuthUser } from "@/features/auth/authSlice";
import type { Page } from "@/features/requests/requestsApi";

export type Priority = "low" | "normal" | "high" | "critical";

export interface FacultyOut {
  id: number;
  name: string;
  code: string;
  hemis_id: string | null;
  contact_email: string | null;
  is_active: boolean;
}

export interface DepartmentOut {
  id: number;
  faculty_id: number;
  name: string;
  code: string;
}

export interface StudentGroupOut {
  id: number;
  faculty_id: number | null;
  name: string;
  hemis_id: string | null;
  specialty: string | null;
  education_year: string | null;
  is_active: boolean;
}

/** Where a request filed under a service type goes. */
export type ServiceRouting = "auto_reply" | "faculty_manager" | "general_manager";

export const SERVICE_ROUTINGS: ServiceRouting[] = [
  "auto_reply",
  "faculty_manager",
  "general_manager",
];

/**
 * A root node is a request type (name + description); its children are
 * service types, which carry the SLA, priority and routing.
 */
export interface CategoryNode {
  id: number;
  parent_id: number | null;
  name: string;
  description: string | null;
  sla_hours: number;
  priority: Priority;
  routing: ServiceRouting;
  auto_reply_text: string | null;
  is_active: boolean;
  icon: string | null;
  children: CategoryNode[];
}

export interface AuditLogOut {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface UserCreatePayload {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
  role_name: string;
  faculty_id?: number | null;
  department_id?: number | null;
  is_general_manager?: boolean;
}

/**
 * Partial update. A field sent as `null` is cleared; a field left out is left
 * alone — that is how a faculty binding or a phone number is removed.
 */
export interface UserUpdatePayload {
  full_name?: string;
  email?: string;
  phone?: string | null;
  password?: string;
  role_name?: string;
  faculty_id?: number | null;
  department_id?: number | null;
  is_general_manager?: boolean;
  is_active?: boolean;
  /** Switch off the user's second factor, e.g. after a lost phone. */
  reset_2fa?: boolean;
}

export interface UserListParams {
  role?: string;
  faculty_id?: number;
  is_active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AuditListParams {
  entity_type?: string;
  entity_id?: number;
  user_id?: number;
  action?: string;
  limit?: number;
  offset?: number;
}

export interface FacultyCreatePayload {
  name: string;
  code: string;
  contact_email?: string | null;
}

/** Without `parent_id` a request type; with it, a service type under one. */
export interface CategoryCreatePayload {
  parent_id?: number | null;
  name: string;
  description?: string | null;
  sla_hours?: number;
  priority?: Priority;
  routing?: ServiceRouting;
  auto_reply_text?: string | null;
  icon?: string | null;
}

export interface CategoryUpdatePayload {
  name?: string;
  description?: string | null;
  sla_hours?: number;
  priority?: Priority;
  routing?: ServiceRouting;
  auto_reply_text?: string | null;
  icon?: string | null;
  is_active?: boolean;
}

export interface FacultyUpdatePayload {
  name?: string;
  code?: string;
  contact_email?: string | null;
  is_active?: boolean;
}

export interface GroupUpdatePayload {
  name?: string;
  faculty_id?: number | null;
  specialty?: string | null;
  education_year?: string | null;
  is_active?: boolean;
}

export type ApiScope = "requests:read" | "requests:write" | "catalogs:read";

export const API_SCOPES: ApiScope[] = ["requests:read", "requests:write", "catalogs:read"];

export interface ApiClientOut {
  id: number;
  name: string;
  description: string | null;
  client_id: string;
  scopes: ApiScope[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Returned only on create and on rotation: the secret is not stored. */
export interface ApiClientCredentials extends ApiClientOut {
  client_secret: string;
}

export interface ApiClientCreatePayload {
  name: string;
  description?: string | null;
  scopes: ApiScope[];
}

export interface ApiClientUpdatePayload {
  name?: string;
  description?: string | null;
  scopes?: ApiScope[];
  is_active?: boolean;
}

export const adminApi = api.injectEndpoints({
  endpoints: (build) => ({
    // Users
    // Paginated: the student directory alone runs to thousands of rows.
    listUsers: build.query<Page<AuthUser>, UserListParams | void>({
      query: (params) => ({ url: "/users", params: params || undefined }),
      providesTags: (res) =>
        res
          ? [
              ...res.items.map((u) => ({ type: "User" as const, id: u.id })),
              { type: "User" as const, id: "LIST" },
            ]
          : [{ type: "User" as const, id: "LIST" }],
    }),
    createUser: build.mutation<AuthUser, UserCreatePayload>({
      query: (body) => ({ url: "/users", method: "POST", body }),
      invalidatesTags: [{ type: "User", id: "LIST" }],
    }),
    updateUser: build.mutation<AuthUser, { id: number; data: UserUpdatePayload }>({
      query: ({ id, data }) => ({ url: `/users/${id}`, method: "PATCH", body: data }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "User", id },
        { type: "User", id: "LIST" },
      ],
    }),
    deleteUser: build.mutation<void, number>({
      query: (id) => ({ url: `/users/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "User", id: "LIST" }],
    }),

    // Faculties
    listFaculties: build.query<FacultyOut[], { include_inactive?: boolean } | void>({
      // Admin screens pass `include_inactive` so that users still bound to a
      // retired faculty show its name instead of a bare id.
      query: (params) => ({ url: "/faculties", params: params || undefined }),
      providesTags: [{ type: "Faculty", id: "LIST" }],
    }),
    createFaculty: build.mutation<FacultyOut, FacultyCreatePayload>({
      query: (body) => ({ url: "/admin/faculties", method: "POST", body }),
      invalidatesTags: [{ type: "Faculty", id: "LIST" }],
    }),
    updateFaculty: build.mutation<FacultyOut, { id: number; data: FacultyUpdatePayload }>({
      query: ({ id, data }) => ({ url: `/admin/faculties/${id}`, method: "PATCH", body: data }),
      invalidatesTags: [{ type: "Faculty", id: "LIST" }],
    }),
    deactivateFaculty: build.mutation<void, number>({
      query: (id) => ({ url: `/admin/faculties/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Faculty", id: "LIST" }],
    }),

    // Departments
    listDepartments: build.query<DepartmentOut[], { faculty_id?: number } | void>({
      query: (params) => ({ url: "/departments", params: params || undefined }),
      providesTags: [{ type: "Department", id: "LIST" }],
    }),
    createDepartment: build.mutation<
      DepartmentOut,
      { faculty_id: number; name: string; code: string }
    >({
      query: (body) => ({ url: "/admin/departments", method: "POST", body }),
      invalidatesTags: [{ type: "Department", id: "LIST" }],
    }),

    // Student groups
    listGroups: build.query<StudentGroupOut[], { faculty_id?: number } | void>({
      query: (params) => ({ url: "/groups", params: params || undefined }),
      providesTags: [{ type: "Group", id: "LIST" }],
    }),
    updateGroup: build.mutation<StudentGroupOut, { id: number; data: GroupUpdatePayload }>({
      query: ({ id, data }) => ({ url: `/admin/groups/${id}`, method: "PATCH", body: data }),
      invalidatesTags: [{ type: "Group", id: "LIST" }],
    }),

    // Categories
    listCategories: build.query<CategoryNode[], void>({
      query: () => "/categories",
      providesTags: [{ type: "Category", id: "LIST" }],
    }),
    createCategory: build.mutation<CategoryNode, CategoryCreatePayload>({
      query: (body) => ({ url: "/admin/categories", method: "POST", body }),
      invalidatesTags: [{ type: "Category", id: "LIST" }],
    }),
    updateCategory: build.mutation<CategoryNode, { id: number; data: CategoryUpdatePayload }>({
      query: ({ id, data }) => ({ url: `/admin/categories/${id}`, method: "PATCH", body: data }),
      invalidatesTags: [{ type: "Category", id: "LIST" }],
    }),
    deactivateCategory: build.mutation<void, number>({
      query: (id) => ({ url: `/admin/categories/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Category", id: "LIST" }],
    }),

    // API clients
    listApiClients: build.query<ApiClientOut[], void>({
      query: () => "/admin/api-clients",
      providesTags: [{ type: "ApiClient", id: "LIST" }],
    }),
    createApiClient: build.mutation<ApiClientCredentials, ApiClientCreatePayload>({
      query: (body) => ({ url: "/admin/api-clients", method: "POST", body }),
      invalidatesTags: [{ type: "ApiClient", id: "LIST" }],
    }),
    updateApiClient: build.mutation<ApiClientOut, { id: number; data: ApiClientUpdatePayload }>({
      query: ({ id, data }) => ({ url: `/admin/api-clients/${id}`, method: "PATCH", body: data }),
      invalidatesTags: [{ type: "ApiClient", id: "LIST" }],
    }),
    rotateApiClientSecret: build.mutation<ApiClientCredentials, number>({
      query: (id) => ({ url: `/admin/api-clients/${id}/rotate-secret`, method: "POST" }),
      invalidatesTags: [{ type: "ApiClient", id: "LIST" }],
    }),

    // Audit
    listAudit: build.query<Page<AuditLogOut>, AuditListParams | void>({
      query: (params) => ({ url: "/admin/audit", params: params || undefined }),
    }),
  }),
});

export const {
  useListUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useListFacultiesQuery,
  useCreateFacultyMutation,
  useUpdateFacultyMutation,
  useDeactivateFacultyMutation,
  useListDepartmentsQuery,
  useCreateDepartmentMutation,
  useListGroupsQuery,
  useUpdateGroupMutation,
  useListCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeactivateCategoryMutation,
  useListApiClientsQuery,
  useCreateApiClientMutation,
  useUpdateApiClientMutation,
  useRotateApiClientSecretMutation,
  useListAuditQuery,
} = adminApi;

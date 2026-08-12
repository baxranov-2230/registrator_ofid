---
name: royd-frontend-feature
description: Conventions for adding or changing a page, route, or API call in the ROYD React frontend — feature folders, RTK Query endpoint injection and cache tags, role-guarded routes, i18n, and the typecheck gate. Use whenever touching anything under frontend/src.
---

# Adding a frontend feature (ROYD)

## Layout

```
src/features/<domain>/
  <domain>Api.ts      RTK Query endpoints + TS interfaces mirroring the backend schemas
  <Name>Page.tsx      route-level component
  <Name>Dialog.tsx    local sub-components
src/shared/           cross-feature only: api/, components/, i18n/
src/app/              store, router, theme, i18n bootstrap
```

Imports use the `@/` alias (`@/features/...`), never deep relative paths.

## API calls

All data goes through RTK Query — no bare `fetch` (the one exception is `hemisService.ts`, which must bypass our auth layer).

```ts
export const domainApi = api.injectEndpoints({
  endpoints: (build) => ({
    listThings: build.query<ThingOut[], { faculty_id?: number } | void>({
      query: (params) => ({ url: "/things", params: params || undefined }),
      providesTags: [{ type: "Thing", id: "LIST" }],
    }),
    createThing: build.mutation<ThingOut, ThingCreatePayload>({
      query: (body) => ({ url: "/admin/things", method: "POST", body }),
      invalidatesTags: [{ type: "Thing", id: "LIST" }],
    }),
  }),
});
```

- New tag types must be added to `tagTypes` in `shared/api/base.ts` or the invalidation silently no-ops.
- The base query already attaches the bearer token and retries once through `/auth/refresh` on a 401. Do not hand-roll auth headers or refresh logic.
- Interfaces must match the Pydantic schema field-for-field, including `snake_case` names and `| null` on optionals. A field the backend does not return is a build error waiting to happen.

## Routes

Add to `src/app/router.tsx` inside the correct `<RequireAuth roles={[...]} />` block, and add the matching entry to `shared/components/Sidebar.tsx`. Role names are the backend strings: `student`, `registrator`, `staff`, `admin`, `leadership`.

`RequireAuth` is a UX gate only — the backend re-checks every request. Never let a route guard stand in for a server-side permission.

## i18n

Every user-visible string goes through `t("namespace.key")`. Add the key to **both** `shared/i18n/uz.json` and `shared/i18n/ru.json`. `ru.json` is currently near-empty and falls back to Uzbek; do not widen that gap.

## Errors and loading

Render RTK Query errors with `formatApiError(err)` from `@/shared/api/errors` — it unpacks FastAPI's string `detail` and its 422 validation array. Handle `isLoading` and the empty-list case explicitly; MUI `Skeleton` or `CircularProgress` for the former.

## Before you call it done

```bash
cd frontend
./node_modules/.bin/tsc -b          # npm run build gates on this — it currently fails
./node_modules/.bin/eslint . --ext .ts,.tsx
```

Use the local binaries: `npx tsc` and `npx eslint` resolve to the wrong packages in this repo.

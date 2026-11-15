import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.ts"),
  route("auth/callback", "routes/auth.callback.ts"),
  route("mfa", "routes/mfa.tsx"),
  layout("routes/app.tsx", [
    index("routes/app.index.tsx"),
    route("posts", "routes/app.posts.tsx"),
    route("posts/new", "routes/app.posts.new.tsx"),
    route("posts/:id", "routes/app.posts.$id.tsx"),
    route("review", "routes/app.review.tsx"),
    route("audit", "routes/app.audit.tsx"),
  ]),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;

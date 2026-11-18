import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.ts"),
  route("auth/callback", "routes/auth.callback.ts"),
  route("mfa", "routes/mfa.tsx"),
  route("ai", "routes/ai.ts"),
  layout("routes/app.tsx", [
    index("routes/app.index.tsx"),
    route("dashboard", "routes/app.dashboard.tsx"),
    route("admin", "routes/app.admin.tsx"),
    route("admin/team", "routes/app.admin.team.tsx"),
    route("admin/payouts", "routes/app.admin.payouts.tsx"),
    route("earnings", "routes/app.earnings.tsx"),
    route("posts", "routes/app.posts.tsx"),
    route("posts/new", "routes/app.posts.new.tsx"),
    route("posts/:id", "routes/app.posts.$id.tsx"),
    route("review", "routes/app.review.tsx"),
    route("audit", "routes/app.audit.tsx"),
    route("subscribers", "routes/app.subscribers.tsx"),
    route("sponsored", "routes/app.sponsored.tsx"),
    route("sponsored/:id", "routes/app.sponsored.$id.tsx"),
    route("ads", "routes/app.ads.tsx"),
    route("link-safety", "routes/app.link-safety.tsx"),
    route("trending", "routes/app.trending.tsx"),
  ]),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;

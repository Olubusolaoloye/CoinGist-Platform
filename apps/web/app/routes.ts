import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("news", "routes/section.tsx", { id: "section-news" }),
  route("gist", "routes/section.tsx", { id: "section-gist" }),
  route("learn", "routes/section.tsx", { id: "section-learn" }),
  route("africa", "routes/category.tsx", { id: "africa" }),
  route("category/:slug", "routes/category.tsx"),
  route("tag/:slug", "routes/tag.tsx"),
  route("author/:slug", "routes/author.tsx"),
  route("resources/theme", "routes/resources.theme.ts"),
  route(":section/:slug", "routes/article.tsx"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;

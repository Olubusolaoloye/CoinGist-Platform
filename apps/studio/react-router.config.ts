import type { Config } from "@react-router/dev/config";

// SSR is mandatory (see CLAUDE.md): every route renders on the server.
export default { ssr: true } satisfies Config;

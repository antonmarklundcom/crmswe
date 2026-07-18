import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // mysql2 (and better-auth's node-crypto-heavy internals) use dynamic
  // `require()` of Node builtins that Next's webpack server build can't
  // statically bundle — keep them as real Node require calls instead of
  // trying to inline them. Needed as soon as any server module reaches the
  // db client (worker/instrumentation.ts already did in 1A; 1B adds many
  // more server components/actions that import it transitively).
  serverExternalPackages: ["mysql2", "better-auth"],
  webpack: (config, { nextRuntime, webpack }) => {
    // 1B adds middleware.ts (edge runtime), which makes Next build an Edge
    // variant of instrumentation.ts's register() too — even though its own
    // `NEXT_RUNTIME !== "nodejs"` guard means the worker import never
    // actually *executes* on Edge, webpack still tries to statically bundle
    // that branch, dragging in mysql2 (Node-only natives: crypto/tls/etc,
    // unsupported on Edge). Swap the worker entry point (and mysql2 itself,
    // reached transitively via db/client.ts) for Edge-safe stubs — safe
    // because the guard above prevents either from ever running there.
    if (nextRuntime === "edge") {
      config.resolve.alias = {
        ...config.resolve.alias,
        mysql2: false,
      };
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /[\\/]src[\\/]worker[\\/]index(\.ts)?$/,
          path.resolve(__dirname, "src/worker/edge-stub.ts"),
        ),
      );
    }
    return config;
  },
};

export default withNextIntl(nextConfig);

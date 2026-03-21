import type { ChromaClient as ChromaSdkClient } from "chromadb";
import { ChromaClient } from "chromadb";
import { Config, Data, Effect, Layer, Option, ServiceMap } from "effect";

export class ChromaError extends Data.TaggedError("ChromaError")<{
  cause: unknown;
}> {}

export class ChromaInitError extends Data.TaggedError("ChromaInitError")<{
  cause: unknown;
}> {}

const ChromaConfig = Config.all({
  url: Config.option(Config.string("CHROMA_URL")),
  host: Config.option(Config.string("CHROMA_HOST")),
  port: Config.option(Config.number("CHROMA_PORT")),
  headersJson: Config.option(Config.string("CHROMA_HEADERS_JSON")),
});

export class ChromaService extends ServiceMap.Service<ChromaService>()(
  "ChromaService",
  {
    make: Effect.gen(function* () {
      const config = yield* ChromaConfig;
      const url = Option.getOrUndefined(config.url);
      const host = Option.getOrUndefined(config.host);
      const port = Option.getOrUndefined(config.port);
      const headersJson = Option.getOrUndefined(config.headersJson);

      const headers = headersJson ? JSON.parse(headersJson) : undefined;

      const client = yield* Effect.try({
        try: () =>
          url
            ? new ChromaClient({ path: url, headers })
            : new ChromaClient({
                host: host ?? "localhost",
                port: port ?? 8000,
                headers,
              }),
        catch: (cause) => new ChromaInitError({ cause }),
      });

      const use = <A>(fn: (client: ChromaSdkClient) => Promise<A>) =>
        Effect.tryPromise({
          try: () => fn(client),
          catch: (cause) => new ChromaError({ cause }),
        }).pipe(Effect.withSpan(`chroma.${fn.name || "use"}`));

      return { client, use } as const;
    }),
  },
) {
  static Default = Layer.effect(ChromaService)(ChromaService.make);
}

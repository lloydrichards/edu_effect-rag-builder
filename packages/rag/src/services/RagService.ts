import type { Metadata, Where, WhereDocument } from "chromadb";
import { Data, Effect, Layer, ServiceMap } from "effect";
import { ChromaService } from "./ChromaService";

export class RagError extends Data.TaggedError("RagError")<{
  message: string;
  cause: unknown;
}> {}
export type RagHit = Readonly<{
  id: string;
  score: number | null;
  document: string | null;
  metadata: Record<string, unknown> | null;
}>;

const normalizeHits = (result: {
  ids?: Array<Array<string>>;
  documents?: Array<Array<string | null>>;
  metadatas?: Array<Array<Record<string, unknown> | null>>;
  distances?: Array<Array<number | null>>;
}): Array<RagHit> => {
  const ids = result.ids?.[0] ?? [];
  const documents = result.documents?.[0] ?? [];
  const metadatas = result.metadatas?.[0] ?? [];
  const distances = result.distances?.[0] ?? [];

  return ids.map((id: string, index: number) => ({
    id,
    score: distances[index] ?? null,
    document: documents[index] ?? null,
    metadata: metadatas[index] ?? null,
  }));
};

export class RagService extends ServiceMap.Service<RagService>()("RagService", {
  make: Effect.gen(function* () {
    const chroma = yield* ChromaService;

    const getCollection = (name: string) =>
      chroma.use((sdk) =>
        sdk.getOrCreateCollection({
          name,
        }),
      );

    const ingest = Effect.fn("ingest")(function* (
      input: Readonly<{
        collection: string;
        ids: Array<string>;
        documents: Array<string>;
        embeddings?: Array<Array<number>>;
        metadatas?: Metadata[];
      }>,
    ) {
      yield* Effect.log(
        `[RagService] Ingest request received for collection "${input.collection}" with ${input.ids.length} items`,
      );
      const collection = yield* getCollection(input.collection);

      yield* Effect.tryPromise({
        try: () =>
          collection.upsert({
            ids: input.ids,
            documents: input.documents,
            ...(input.embeddings ? { embeddings: input.embeddings } : {}),
            ...(input.metadatas ? { metadatas: input.metadatas } : {}),
          }),
        catch: (error) =>
          new RagError({
            message: `Error during ingestion into collection "${input.collection}"`,
            cause: error,
          }),
      });

      return { count: input.ids.length } as const;
    });

    const retrieve = Effect.fn("retrieve")(function* (
      input: Readonly<{
        collection: string;
        queries?: Array<string>;
        embedding?: Array<number>;
        topK: number;
        where?: Where;
        whereDocument?: WhereDocument;
      }>,
    ) {
      const collection = yield* getCollection(input.collection);

      const result = yield* Effect.tryPromise({
        try: () =>
          collection.query({
            nResults: input.topK,
            ...(input.queries ? { queryTexts: input.queries } : {}),
            ...(input.embedding ? { queryEmbeddings: [input.embedding] } : {}),
            ...(input.where ? { where: input.where } : {}),
            ...(input.whereDocument
              ? { whereDocument: input.whereDocument }
              : {}),
            include: ["documents", "metadatas", "distances"],
          }),
        catch: (error) =>
          new RagError({
            message: `Error during retrieval from collection "${input.collection}"`,
            cause: error,
          }),
      });

      return {
        hits: normalizeHits(
          result as {
            ids?: Array<Array<string>>;
            documents?: Array<Array<string | null>>;
            metadatas?: Array<Array<Record<string, unknown> | null>>;
            distances?: Array<Array<number | null>>;
          },
        ),
      } as const;
    });

    const listDocuments = Effect.fn("listDocuments")(function* (input: {
      collection: string;
      query?: string;
      limit?: number;
    }) {
      const collection = yield* getCollection(input.collection);
      const limit = input.limit ?? 10;

      const result = yield* Effect.tryPromise({
        try: () =>
          collection.get({
            include: ["documents", "metadatas"],
            ...(input.query
              ? { whereDocument: { $contains: input.query } }
              : {}),
            ...(Number.isFinite(limit) ? { limit } : {}),
          }),
        catch: (error) =>
          new RagError({
            message: `Error listing documents in collection "${input.collection}"`,
            cause: error,
          }),
      });

      const documents = (result.documents ?? []).map((doc, index) => ({
        id: result.ids?.[index] ?? null,
        document: doc,
        metadata: result.metadatas?.[index] ?? null,
      }));

      return { documents } as const;
    });

    return { ingest, retrieve, listDocuments } as const;
  }),
}) {
  static Default = Layer.effect(RagService)(RagService.make).pipe(
    Layer.provide(ChromaService.Default),
  );
}

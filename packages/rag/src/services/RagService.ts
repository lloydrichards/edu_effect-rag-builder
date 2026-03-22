import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";
import type { Metadata, Where, WhereDocument } from "chromadb";
import { Effect, Layer, ServiceMap } from "effect";
import { ChromaService } from "./ChromaService";

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
          embeddingFunction: new DefaultEmbeddingFunction(),
        }),
      );

    const ingest = Effect.fn("ingest")(function* (
      input: Readonly<{
        collection: string;
        ids: Array<string>;
        embeddings?: Array<Array<number>>;
        documents?: Array<string>;
        metadatas?: Metadata[];
      }>,
    ) {
      yield* Effect.log(
        `[RagService] Ingest request received for collection "${input.collection}" with ${input.ids.length} items`,
      );
      const collection = yield* getCollection(input.collection);

      yield* Effect.tryPromise(() =>
        collection.upsert({
          ids: input.ids,
          ...(input.embeddings ? { embeddings: input.embeddings } : {}),
          ...(input.documents ? { documents: input.documents } : {}),
          ...(input.metadatas ? { metadatas: input.metadatas } : {}),
        }),
      );

      return { count: input.ids.length } as const;
    });

    const retrieve = Effect.fn("retrieve")(function* (
      input: Readonly<{
        collection: string;
        embedding: Array<number>;
        topK: number;
        where?: Where;
        whereDocument?: WhereDocument;
      }>,
    ) {
      const collection = yield* getCollection(input.collection);

      const result = yield* Effect.tryPromise(() =>
        collection.query({
          queryEmbeddings: [input.embedding],
          nResults: input.topK,
          ...(input.where ? { where: input.where } : {}),
          ...(input.whereDocument
            ? { whereDocument: input.whereDocument }
            : {}),
          include: ["documents", "metadatas", "distances"],
        }),
      );

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

    return { ingest, retrieve } as const;
  }),
}) {
  static Default = Layer.effect(RagService)(RagService.make).pipe(
    Layer.provide(ChromaService.Default),
  );
}

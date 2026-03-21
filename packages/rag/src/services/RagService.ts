import type {
  ChromaClient as ChromaSdkClient,
  Metadata,
  Where,
  WhereDocument,
} from "chromadb";
import { Effect, Layer, ServiceMap } from "effect";
import { ChromaService } from "./ChromaService";

export type RagHit = Readonly<{
  id: string;
  score: number | null;
  document: string | null;
  metadata: Record<string, unknown> | null;
}>;

export type RagIngestInput = Readonly<{
  collection: string;
  ids: Array<string>;
  embeddings: Array<Array<number>>;
  documents?: Array<string>;
  metadatas?: Metadata[];
  ensureCollection?: boolean;
}>;

export type RagRetrieveInput = Readonly<{
  collection: string;
  embedding: Array<number>;
  topK: number;
  where?: Where;
  whereDocument?: WhereDocument;
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
    metadata: (metadatas[index] as Record<string, unknown> | null) ?? null,
  }));
};

export class RagService extends ServiceMap.Service<RagService>()("RagService", {
  make: Effect.gen(function* () {
    const chroma = yield* ChromaService;

    const getCollection = (name: string, ensureCollection: boolean) =>
      chroma.use((sdk) =>
        ensureCollection
          ? sdk.getOrCreateCollection({ name })
          : sdk.getCollection({ name }),
      );

    const ingest = Effect.fn("ingest")(function* (input: RagIngestInput) {
      const collection = yield* getCollection(
        input.collection,
        input.ensureCollection ?? true,
      );

      yield* chroma.use((_client: ChromaSdkClient) => {
        return collection.upsert({
          ids: input.ids,
          embeddings: input.embeddings,
          ...(input.documents ? { documents: input.documents } : {}),
          ...(input.metadatas ? { metadatas: input.metadatas } : {}),
        });
      });

      return { count: input.ids.length } as const;
    });

    const retrieve = Effect.fn("retrieve")(function* (input: RagRetrieveInput) {
      const collection = yield* getCollection(input.collection, true);

      const result = yield* chroma.use((_client: ChromaSdkClient) =>
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

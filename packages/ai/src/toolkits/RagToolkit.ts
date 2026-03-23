import { RagService } from "@repo/rag";
import { Effect, Schema } from "effect";
import { EmbeddingModel, Tool, Toolkit } from "effect/unstable/ai";

/**
 * List Document Tool - Lists documents in a collection
 */
const listDocumentTool = Tool.make("listDocument", {
  description:
    "List documents in a collection. Example: listDocument(collection: 'uploads')",
  parameters: Schema.Struct({
    collection: Schema.String.pipe(
      Schema.annotate({
        default: "uploads",
        description: "The name of the collection to list documents from.",
      }),
    ),
    query: Schema.String.pipe(
      Schema.annotate({
        description: "Optional text query to filter documents.",
      }),
    ),
  }),
  success: Schema.Struct({
    documents: Schema.Array(
      Schema.Struct({
        document: Schema.String,
      }),
    ),
  }),
  failure: Schema.String,
});

const RetrieverTool = Tool.make("retriever", {
  description:
    "Retrieve documents from a collection based on a query. Example: retriever(collection: 'uploads', query: 'What is in the collection?')",
  parameters: Schema.Struct({
    collection: Schema.String.pipe(
      Schema.annotate({
        default: "uploads",
        description: "The name of the collection to retrieve documents from.",
      }),
    ),
    query: Schema.String.pipe(
      Schema.annotate({
        description: "The query to use for retrieving documents.",
      }),
    ),
    filename: Schema.NullOr(Schema.String).pipe(
      Schema.annotate({
        description:
          "(optional) The name of the file to retrieve documents from.",
      }),
    ),
    limit: Schema.String.pipe(
      Schema.annotate({
        default: "3",
        description: "(optional) The number of results to retrieve.",
      }),
    ),
  }),
  success: Schema.Struct({
    documents: Schema.Array(
      Schema.Struct({
        document: Schema.String,
        score: Schema.NullishOr(Schema.Number),
      }),
    ),
  }),
  failure: Schema.String,
});

const DeleteCollectionTool = Tool.make("deleteCollection", {
  description:
    "Delete a collection by name. Example: deleteCollection(collection: 'uploads')",
  parameters: Schema.Struct({
    collection: Schema.String.pipe(
      Schema.annotate({
        default: "uploads",
        description: "The name of the collection to delete.",
      }),
    ),
  }),
  success: Schema.Struct({
    collection: Schema.String,
  }),
  failure: Schema.String,
});

export const RagToolkit = Toolkit.make(
  listDocumentTool,
  RetrieverTool,
  DeleteCollectionTool,
);

export const RagToolkitLive = RagToolkit.toLayer(
  Effect.gen(function* () {
    const rag = yield* RagService;
    const embedder = yield* EmbeddingModel.EmbeddingModel;
    return {
      listDocument: (params) =>
        Effect.gen(function* () {
          const listResult = yield* rag.listDocuments({
            collection: params.collection,
            limit: 10,
            ...(params.query ? { query: params.query } : {}),
          });
          const documentsText = listResult.documents.map(
            (doc) => doc.document || "",
          );
          return { documents: documentsText.map((document) => ({ document })) };
        }).pipe(
          Effect.catch((error) =>
            Effect.fail(
              "Error listing documents in collection '" +
                params.collection +
                "': " +
                String(error),
            ),
          ),
        ),
      retriever: (params) =>
        Effect.gen(function* () {
          const embedded = yield* embedder.embed(params.query);
          yield* Effect.log(
            `[RagToolkit] Retrieve embed: collection="${params.collection}", queryLength=${params.query.length}, embeddingDims=${embedded.vector.length}`,
          );
          const retrieveResult = yield* rag.retrieve({
            collection: params.collection,
            embedding: [...embedded.vector],
            topK: +params.limit,
            ...(params.filename
              ? { where: { fileName: { $contains: params.filename } } }
              : {}),
          });
          yield* Effect.log(
            `[RagToolkit] Retrieve result: collection="${params.collection}", hits=${retrieveResult.hits.length}`,
          );
          return {
            documents:
              retrieveResult.hits.map((hit) => ({
                document: hit.document || "",
                score: hit.score,
              })) ?? [],
          };
        }).pipe(
          Effect.catch((error) =>
            Effect.fail(
              "Error retrieving documents from collection '" +
                params.collection +
                "': " +
                String(error),
            ),
          ),
        ),
      deleteCollection: (params) =>
        Effect.gen(function* () {
          return yield* rag.deleteCollection({
            collection: params.collection,
          });
        }).pipe(
          Effect.catch((error) =>
            Effect.fail(
              "Error deleting collection '" +
                params.collection +
                "': " +
                String(error),
            ),
          ),
        ),
    };
  }),
);

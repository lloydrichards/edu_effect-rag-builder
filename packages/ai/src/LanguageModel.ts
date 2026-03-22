import {
  OpenAiClient,
  OpenAiEmbeddingModel,
  OpenAiLanguageModel,
} from "@effect/ai-openai";
import { Config, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

const OpenAiLive = OpenAiClient.layerConfig({
  apiKey: Config.redacted("OPENAI_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

export const SmartModelLive = OpenAiLanguageModel.layer({
  model: "claude-sonnet-4-5",
}).pipe(Layer.provide(OpenAiLive));

export const FastModelLive = OpenAiLanguageModel.layer({
  model: "claude-haiku-4-5",
}).pipe(Layer.provide(OpenAiLive));

export const EmbeddingModelLive = OpenAiEmbeddingModel.layer({
  model: "text-embedding-3-small",
  config: { dimensions: 1536 },
}).pipe(Layer.provide(OpenAiLive));

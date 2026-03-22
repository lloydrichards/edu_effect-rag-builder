import type { ChatStreamPart } from "@repo/domain/Chat";
import type { ChromaError, RagError } from "@repo/rag";
import { Cause, Effect, Layer, Queue, ServiceMap, String } from "effect";
import { Chat, type LanguageModel, Prompt, Toolkit } from "effect/unstable/ai";
import { RagToolkit } from "../toolkits/RagToolkit";
import { SampleToolkit } from "../toolkits/SampleToolkit";
import { runAgenticLoop } from "../workflow/AgenticLoop";

export type ChatServiceApi = {
  chat: (
    history: Array<Prompt.Message>,
  ) => Effect.Effect<
    Queue.Queue<typeof ChatStreamPart.Type, Cause.Done>,
    never,
    LanguageModel.LanguageModel
  >;
};

export class ChatService extends ServiceMap.Service<ChatServiceApi>()(
  "ChatService",
  {
    make: Effect.gen(function* () {
      const chat = Effect.fn("chat")(function* (
        history: Array<Prompt.Message>,
      ) {
        const queue = yield* Queue.make<
          typeof ChatStreamPart.Type,
          Cause.Done
        >();

        yield* Effect.forkScoped(
          Effect.gen(function* () {
            const systemMessage = String.stripMargin(`
              |You are a helpful general assistant.
              |You have access to tools and should use them when appropriate.
              |Be concise and direct in your responses.
            `);

            const session = yield* Chat.fromPrompt(
              Prompt.make(history).pipe(Prompt.setSystem(systemMessage)),
            );

            const toolkit = yield* Toolkit.merge(SampleToolkit, RagToolkit);

            yield* runAgenticLoop({
              chat: session,
              queue,
              toolkit,
            });
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.gen(function* () {
                yield* Effect.logError(`Chat error: ${cause}`);
                yield* Queue.offer(queue, {
                  _tag: "error",
                  message: `System error: ${Cause.pretty(cause)}`,
                  recoverable: false,
                });
              }),
            ),
            Effect.ensuring(Queue.end(queue)),
          ),
        );

        return queue;
      });

      return { chat } as const;
    }) as Effect.Effect<
      ChatServiceApi,
      ChromaError | RagError,
      LanguageModel.LanguageModel
    >,
  },
) {}

export const ChatServiceLive = Layer.effect(ChatService)(ChatService.make);

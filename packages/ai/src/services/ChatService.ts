import type { ChatStreamPart } from "@repo/domain/Chat";
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
              |You are RAG Bot, an AI assistant for answering questions using retrieved documents.
              |When given a question, you should use the tools available to you to find relevant information and provide a helpful answer.
              |Always use the provided tools to retrieve information when needed, and cite your sources in the final answer.
              |If you don't know the answer, say you don't know. Do not make up answers.
            `);

            const session = yield* Chat.fromPrompt(
              Prompt.make(history).pipe(Prompt.setSystem(systemMessage)),
            );

            const toolkit = yield* Toolkit.merge(SampleToolkit, RagToolkit);

            yield* runAgenticLoop({
              chat: session,
              queue,
              toolkit,
              maxIterations: 25,
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
    }),
  },
) {}

export const ChatServiceLive = Layer.effect(ChatService)(ChatService.make);

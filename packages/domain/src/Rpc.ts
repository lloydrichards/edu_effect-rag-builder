import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { ChatMessage, ChatStreamPart } from "./Chat";
import { UploadChunk } from "./Upload";

// Define Event RPC

export const TickEvent = Schema.Union([
  Schema.TaggedStruct("starting", {}),
  Schema.TaggedStruct("tick", {}),
  Schema.TaggedStruct("end", {}),
]);

export const UploadAck = Schema.Struct({
  ok: Schema.Literal(true),
  status: Schema.Literals([
    "chunk-received",
    "ingest-complete",
    "ingest-failed",
  ]),
});

export type UploadAck = Schema.Schema.Type<typeof UploadAck>;

export class EventRpc extends RpcGroup.make(
  Rpc.make("tick", {
    payload: {
      ticks: Schema.Number,
    },
    success: TickEvent,
    stream: true,
  }),
  Rpc.make("chat", {
    payload: {
      messages: Schema.Array(ChatMessage),
    },
    success: ChatStreamPart,
    stream: true,
  }),
  Rpc.make("uploadChunk", {
    payload: UploadChunk,
    success: UploadAck,
  }),
) {}

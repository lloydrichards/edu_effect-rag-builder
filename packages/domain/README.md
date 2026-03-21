# @repo/domain

Shared schemas and RPC contracts for the edu_effect-rag-builder experiment,
built with Effect Schema.

## Overview

This package provides type-safe schemas and utilities shared between the client
and server applications. It defines the contracts used for ingestion, retrieval,
and chat/agent flows.

## Features

- **Effect Schema Integration** - Runtime validation with compile-time types
- **Shared Types** - Common interfaces used across apps
- **Type Safety** - End-to-end type safety from client to server
- **RAG contracts** - Schemas for ingestion, retrieval, and chat flows
- **Functional Programming** - Built with Effect ecosystem patterns

## Usage

Import schemas in your apps:

```typescript
// In client or server
import { ApiResponse } from "@repo/domain/Api";

// Use types for API communication
const response: ApiResponse = await fetchData();

// Use schemas for validation
const valid = Schema.decodeUnknownSync(ApiResponse)(value);
```

## Structure

```txt
src/
├── Api.ts       # HttpApi definitions (REST endpoints)
├── Chat.ts      # Chat schemas and events
├── Rpc.ts       # RPC definitions (HTTP streaming)
└── WebSocket.ts # WebSocket RPC definitions (real-time)
```

## Learn More

- [Effect Schema Documentation](https://effect.website/docs/schema)
- [Project Overview](../../README.md)

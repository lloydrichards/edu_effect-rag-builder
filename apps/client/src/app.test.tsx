import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import App from "./app";

// Mock the atom hooks (v4: @effect/atom-react)
vi.mock("@effect/atom-react", () => ({
  useAtom: vi.fn(() => [{ _tag: "Initial" }, vi.fn()]),
  useAtomSet: vi.fn(() => vi.fn()),
}));

// Mock AsyncResult from effect/unstable/reactivity
vi.mock("effect/unstable/reactivity", () => ({
  AsyncResult: {
    getOrElse: vi.fn((_result: unknown, fallback: () => unknown) => {
      return fallback();
    }),
    builder: vi.fn(() => ({
      onSuccess: vi.fn().mockReturnThis(),
      onFailure: vi.fn().mockReturnThis(),
      onInitial: vi.fn().mockReturnThis(),
      orNull: vi.fn(() => null),
    })),
    match: vi.fn((_result: unknown, _handlers: unknown) => null),
    isSuccess: vi.fn(() => false),
    isInitial: vi.fn(() => true),
    isFailure: vi.fn(() => false),
    isWaiting: vi.fn(() => false),
  },
}));

vi.mock("@/lib/atoms/chat-atom", () => ({
  chatAtom: vi.fn(),
}));

vi.mock("@/lib/atoms/chunker-atom", () => ({
  chunkerAtom: vi.fn(),
}));

vi.mock("@/lib/atoms/upload-atom", () => ({
  uploadAtom: vi.fn(),
  validateFiles: vi.fn(() => ({ valid: [], rejected: [] })),
}));

describe("App", () => {
  test("renders without crashing", async () => {
    const screen = await render(<App />);
    await expect.element(screen.getByText("Effect RAG Builder")).toBeVisible();
  });

  test("displays the subtitle", async () => {
    const screen = await render(<App />);
    await expect
      .element(
        screen.getByText("Build, chunk, and query knowledge with Effect"),
      )
      .toBeVisible();
  });

  test("displays the description", async () => {
    const screen = await render(<App />);
    await expect
      .element(
        screen.getByText(
          "An educational workspace for RAG workflows and monorepo patterns",
        ),
      )
      .toBeVisible();
  });

  test("renders chunker playground", async () => {
    const screen = await render(<App />);
    const chunkerHeading = screen.getByText("Chunker Playground");
    chunkerHeading.element().scrollIntoView({ block: "center" });
    await expect.element(chunkerHeading).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Chunk text" }))
      .toBeVisible();
  });

  test("renders chat section", async () => {
    const screen = await render(<App />);
    const chatHeading = screen.getByText("Chat (RPC)");
    chatHeading.element().scrollIntoView({ block: "center" });
    await expect.element(chatHeading).toBeVisible();
    await expect
      .element(screen.getByPlaceholder("Send a message"))
      .toBeVisible();
  });

  test("renders upload section", async () => {
    const screen = await render(<App />);
    const uploadHeading = screen.getByText("Document Upload");
    uploadHeading.element().scrollIntoView({ block: "center" });
    await expect.element(uploadHeading).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Add files" }))
      .toBeVisible();
  });

  test("renders brand logo", async () => {
    const screen = await render(<App />);
    await expect.element(screen.getByAltText("Effect logo")).toBeVisible();
  });
});

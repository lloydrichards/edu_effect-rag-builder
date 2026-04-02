import { Github } from "lucide-react";
import effect from "./assets/effect.svg";
import { ChatBox } from "./components/chat-box";
import { ChunkerVisualizer } from "./components/chunker-visualizer";
import { ThemeToggle } from "./components/theme-toggle";
import { Button } from "./components/ui/button";
import { TooltipProvider } from "./components/ui/tooltip";
import { UploadCard } from "./components/upload-card";

function App() {
  return (
    <TooltipProvider>
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-8 p-4">
        <ThemeToggle />
        <div className="text-center">
          <h1 className="font-black text-5xl flex gap-5 items-center justify-center mb-4">
            <img
              alt="Effect logo"
              height={64}
              src={effect}
              width={64}
              className="dark:invert"
            />
            Effect RAG Builder
          </h1>
          <h2 className="font-bold text-2xl">
            Build, chunk, and query knowledge with Effect
          </h2>
          <p className="text-muted-foreground">
            An educational workspace for RAG workflows and monorepo patterns
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-6 auto-rows-[60rem_30rem] lg:auto-rows-[44rem_40rem] lg:grid-cols-2">
          <ChunkerVisualizer />
          <ChatBox />
          <UploadCard />
        </div>
        <footer className="w-full flex justify-between">
          <Button
            variant="link"
            render={(props) => (
              <a
                {...props}
                href="https://www.lloydrichards.dev"
                target="_blank"
                rel="noopener"
              >
                lloydrichards.dev
              </a>
            )}
          />
          <Button
            variant="link"
            render={(props) => (
              <a
                {...props}
                href="https://github.com/lloydrichards/edu_effect-rag-builder"
                target="_blank"
                rel="noopener"
              >
                <Github />
                Github
              </a>
            )}
          />
        </footer>
      </div>
    </TooltipProvider>
  );
}

export default App;

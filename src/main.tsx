import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";

import { App } from "./app";
import "./styles.css";
import { wagmiConfig } from "./wagmi";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element is missing.");
}

const queryClient = new QueryClient();

createRoot(root).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);

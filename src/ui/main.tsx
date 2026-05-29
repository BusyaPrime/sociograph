import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@ui/styles/fonts.css";
import "@ui/styles/tokens.css";
import "@ui/styles/global.css";
import App from "@ui/App";

const container = document.getElementById("root");
if (!container) {
  throw new Error('Root element "#root" was not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

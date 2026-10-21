import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./i18n";
// PAD-635: the typefaces are self-hosted, so no page asks Google for them before consent.
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);

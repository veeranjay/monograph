import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./styles/index.css";
import "./styles/workspace.css";
import "./styles/shell.css";

// Preserve bookmarks from the original hash router (#note/id, #subject/id, etc.).
if (window.location.hash && !window.location.hash.startsWith("#/")) {
  window.history.replaceState(
    null,
    "",
    window.location.pathname +
      window.location.search +
      "#/" +
      window.location.hash.slice(1),
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

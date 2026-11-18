import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/guide.css";
import "./styles/skeleton.css";
import "./styles/dialogs.css";
import "./styles/buttons.css";
import "./styles/pages.css";
import "./styles/reveal.css";
import "./styles/share.css";
import "./styles/achievements.css";
import "./styles/chrome.css";

createRoot(document.getElementById("root")).render(<App />);

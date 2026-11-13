import { createRoot } from "react-dom/client";
import "./styles.css";
import { restoreTheme } from "./actions";
import { App } from "./ui/App";
import { useStore } from "./store";

restoreTheme();
(window as unknown as { __store?: unknown }).__store = useStore;
createRoot(document.getElementById("root")!).render(<App />);

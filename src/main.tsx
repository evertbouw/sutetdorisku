import { createRoot } from "react-dom/client";
import { App } from "./App";
import { assert } from "./utils/assert";
import { isDefined } from "./utils/isDefined";
import "./main.css";

const node = document.getElementById("app");

assert(isDefined(node), "Could not find app element");

const root = createRoot(node);

root.render(<App />);

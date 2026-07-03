import { createRoot } from "react-dom/client";
import { App } from "./App";
import { assert } from "./utils/assert";
import { isDefined } from "./utils/isDefined";

document.body.style.margin = "0";
document.body.style.padding = "0";

const node = document.getElementById("app");

assert(isDefined(node), "Could not find app element");

const root = createRoot(node);

root.render(<App />);

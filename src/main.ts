import { assert } from "./utils/assert";
import { isDefined } from "./utils/isDefined";
import { createRoot } from "react-dom/client";

const node = document.getElementById("app");

assert(isDefined(node), "Could not find app element");

const root = createRoot(node);

root.render("HELLO WORLD");

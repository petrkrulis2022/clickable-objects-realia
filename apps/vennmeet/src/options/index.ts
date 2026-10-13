import { mountEditor } from "./editor";

console.log("[venn] options page loaded");

const root = document.getElementById("app");
if (root) mountEditor(root);

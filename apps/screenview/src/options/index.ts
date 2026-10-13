import { mountCoverageMap } from "./coverageMap";

console.log("[screenview] options page loaded");

function main() {
  const root = document.getElementById("app");
  if (!root) return;
  mountCoverageMap(root);
}

main();

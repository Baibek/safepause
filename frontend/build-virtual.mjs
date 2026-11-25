// Builds the single-page virtual app: dist-virtual/page.html (styles inlined) + dist-virtual/app.js
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

execSync("npx vite build --mode virtual", { stdio: "inherit" });
const css = readFileSync("dist-virtual/app.css", "utf8");
writeFileSync("dist-virtual/page.html", `<title>Senim</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Unbounded:wght@500;600;700&display=swap">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<style>${css}</style>
<div id="root"></div>
<script type="module" src="app.js"></script>
`);
console.log("dist-virtual/page.html + app.js ready");

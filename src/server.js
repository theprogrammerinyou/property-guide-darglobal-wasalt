import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppServer } from "./http-app.js";

const isEntrypoint =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const port = Number(process.env.PORT || 3000);
  const server = createAppServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Property Guide is listening on port ${port}`);
  });
}

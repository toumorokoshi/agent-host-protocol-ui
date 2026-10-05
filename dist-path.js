import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Absolute directory path to the built static assets of agent-host-protocol-ui
 */
export const distDir = path.resolve(__dirname, "dist");

export default distDir;

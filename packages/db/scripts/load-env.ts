import { config } from "dotenv";
import path from "node:path";

const webRoot = path.resolve(process.cwd(), "../../apps/web");

config({ path: path.join(webRoot, ".env") });
config({ path: path.join(webRoot, ".env.local"), override: true });

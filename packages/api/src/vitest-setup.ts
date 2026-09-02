import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

process.env.OPENAI_API_KEY ??= "test-openai-api-key";

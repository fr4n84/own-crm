import { env } from "@crm-fran/env/server";
import OpenAI from "openai";

import { SUMMARY_MODEL } from "../call-feedback";
import { generateWhatsappDraft, type WhatsappDraftContext } from "./draft";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export function generateWhatsappMessageDraft(context: WhatsappDraftContext) {
  return generateWhatsappDraft(openai, { model: SUMMARY_MODEL, context });
}

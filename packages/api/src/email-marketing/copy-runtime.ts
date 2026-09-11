import { env } from "@crm-fran/env/server";
import OpenAI from "openai";

import { SUMMARY_MODEL } from "../call-feedback";
import { generateEmailCopyDraft } from "./preparation";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export function generateEmailMarketingCopyDraft(input: {
  productContext: string;
  motivationSummary: string;
}) {
  return generateEmailCopyDraft(openai, {
    model: SUMMARY_MODEL,
    productContext: input.productContext,
    motivationSummary: input.motivationSummary,
  });
}

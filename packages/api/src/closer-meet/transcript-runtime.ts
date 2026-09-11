import { env } from "@crm-fran/env/server";
import OpenAI from "openai";

import { SUMMARY_MODEL } from "../call-feedback";
import { recordCoachingDraft } from "../commercial-coaching/service";
import { closerMeetRepository } from "./repository";
import { createOpenAITranscriptAnalyzer } from "./transcript-analysis";
import { createTranscriptCipher } from "./transcript-crypto";
import { createCloserMeetTranscriptService } from "./transcript-service";

export function createCloserMeetTranscriptRuntime() {
  if (!env.CLOSER_MEET_TRANSCRIPT_KEY || !env.CLOSER_MEET_TRANSCRIPT_KEY_ID) return null;
  const cipher = createTranscriptCipher({ base64Key: env.CLOSER_MEET_TRANSCRIPT_KEY, keyId: env.CLOSER_MEET_TRANSCRIPT_KEY_ID });
  const analyzer = createOpenAITranscriptAnalyzer(new OpenAI({ apiKey: env.OPENAI_API_KEY }), SUMMARY_MODEL);
  return createCloserMeetTranscriptService({ repository: closerMeetRepository, cipher, analyzer, recordDraft: recordCoachingDraft });
}
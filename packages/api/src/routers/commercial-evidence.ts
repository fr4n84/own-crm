import { z } from "zod";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";
import { getConfidenceCentre,getLeadEvidence,getMicrosegments,listEvidenceCurrencies,listEvidenceLeads } from "../commercial-evidence/service";
const asOf=z.coerce.date().refine(x=>x<=new Date(),"asOf cannot be in the future");
export const commercialEvidenceRouter=router({
 currencies:permittedProcedure(["leads:read"]).query(({ctx})=>listEvidenceCurrencies({actorId:ctx.session.user.id,admin:ctx.permissions.includes("*")})),
 searchLeads:permittedProcedure(["leads:read"]).input(z.object({query:z.string().max(100).optional()})).query(({ctx,input})=>listEvidenceLeads({actorId:ctx.session.user.id,admin:ctx.permissions.includes("*"),query:input.query})),
 lead:permittedProcedure(["leads:read"]).input(z.object({leadId:z.string().min(1),asOf,currency:z.string().regex(/^[A-Z]{3}$/)})).query(({ctx,input})=>getLeadEvidence({...input,actorId:ctx.session.user.id,admin:ctx.permissions.includes("*")})),
 microsegments:permittedProcedure(["*"]).input(z.object({asOf,currency:z.string().regex(/^[A-Z]{3}$/)})).query(({input})=>getMicrosegments(input.asOf,input.currency)),
 confidence:permittedProcedure(["*"]).input(z.object({asOf})).query(({input})=>getConfidenceCentre(input.asOf)),
});

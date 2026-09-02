import { authRouter } from "./auth";
import { leadsRouter } from "./leads";
import { usersRouter } from "./users";
import { alertsRouter } from "./alerts";
import { calendarRouter } from "./calendar";
import { messagesRouter } from "./messages";
import { rankingsRouter } from "./rankings";
import { dashboardRouter } from "./dashboard";
import { personalGoalsRouter } from "./personal-goals";
import { commercialIntelligenceRouter } from "./commercial-intelligence";
import { commercialExperimentsRouter } from "./commercial-experiments";
import { profitabilityRouter } from "./profitability";
import { decisionCenterRouter } from "./decision-center";
import { commercialEvidenceRouter } from "./commercial-evidence";
import { commercialObservatoryRouter } from "./commercial-observatory";
import { commercialPlanningRouter } from "./commercial-planning";
import { commercialPlaybooksRouter } from "./commercial-playbooks";
import { askCrmRouter } from "./ask-crm";
import { marketingAttributionRouter } from "./marketing-attribution";
import { closerSalesRouter } from "./closer-sales";
import { whatsappRouter } from "./whatsapp";
import { permittedProcedure } from "@crm-fran/api/trpc/trpc";
import { publicProcedure, router } from "../index";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: permittedProcedure(["profile:read"]).query(({ ctx }) => {
    return {
      message: "This is private",
      role: ctx.role,
      user: ctx.session.user,
      permissions: ctx.permissions,
    };
  }),
  createUser: permittedProcedure(["users:create"]).query(({ ctx }) => {
    return {
      message: "This is create user",
      user: ctx.session.user,
      permissions: ctx.permissions,
    };
  }),
  auth: authRouter,
  leads: leadsRouter,
  users: usersRouter,
  alerts: alertsRouter,
  calendar: calendarRouter,
  messages: messagesRouter,
  rankings: rankingsRouter,
  dashboard: dashboardRouter,
  personalGoals: personalGoalsRouter,
  commercialIntelligence: commercialIntelligenceRouter,
  commercialExperiments: commercialExperimentsRouter,
  profitability: profitabilityRouter,
  decisionCenter: decisionCenterRouter,
  commercialEvidence: commercialEvidenceRouter,
  commercialObservatory: commercialObservatoryRouter,
  commercialPlanning: commercialPlanningRouter,
  commercialPlaybooks: commercialPlaybooksRouter,
  askCrm: askCrmRouter,
  marketingAttribution: marketingAttributionRouter,
  closerSales: closerSalesRouter,
  whatsapp: whatsappRouter,
});
export type AppRouter = typeof appRouter;

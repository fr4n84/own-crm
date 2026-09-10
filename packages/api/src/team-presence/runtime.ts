import { teamPresenceRepository } from "./repository";
import { createTeamPresenceService } from "./service";

export const teamPresenceService = createTeamPresenceService(teamPresenceRepository);

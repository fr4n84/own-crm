import { ALERT_SEVERITY, ALERT_KIND } from "@crm-fran/db/schema/index";

export const ALERT_KIND_CONFIG = {
	[ALERT_KIND.NO_CONTACT]: {
		intervalMinutes: 1440,
		maxOccurrences: null as number | null,
		severity: ALERT_SEVERITY.URGENT,
		message: "No se pudo contactar al lead",
	},
		[ALERT_KIND.FOLLOW_UP]: {
			intervalMinutes: 60,
			maxOccurrences: null as number | null,
			severity: ALERT_SEVERITY.INFO,
			message: "Seguimiento de lead asignado",
		},
		[ALERT_KIND.FUTURE_CALL]: {
			intervalMinutes: 60,
			maxOccurrences: 1 as number | null,
			severity: ALERT_SEVERITY.INFO,
			message: "Llamar a futuro",
		},
		[ALERT_KIND.APPOINTMENT]: {
			intervalMinutes: 60,
			maxOccurrences: 1 as number | null,
			severity: ALERT_SEVERITY.INFO,
			message: "Agenda",
		},
		[ALERT_KIND.RESCHEDULED]: {
			intervalMinutes: 60,
			maxOccurrences: 1 as number | null,
			severity: ALERT_SEVERITY.INFO,
			message: "Reagenda",
		},
	} as const;

export type AlertKind = keyof typeof ALERT_KIND_CONFIG;

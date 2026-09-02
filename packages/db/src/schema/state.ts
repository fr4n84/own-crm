import { z } from "zod";

export const LEAD_STATE = {
	SIN_ASIGNAR: "sin asignar",
	ASIGNADO: "Asignado",
	NUMERO_ERRONEO: "número erróneo",
} as const;

export type LeadState = (typeof LEAD_STATE)[keyof typeof LEAD_STATE];

export const leadStateEnum = z.enum([
	LEAD_STATE.SIN_ASIGNAR,
	LEAD_STATE.ASIGNADO,
	LEAD_STATE.NUMERO_ERRONEO,
]);

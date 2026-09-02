import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { db, desc, eq, inArray } from "@crm-fran/db";
import {
	leadActivityEvents,
	leads,
	roles,
	user,
	type LeadQASessionItem,
} from "@crm-fran/db/schema/index";
import type { Context } from "../../context";

import { adminEditLeadQASession } from "./admin-edit-lead-qa-session";

const callerPermissions = ["leads:*", "users:read"];
const closerPermissions = ["leads:*", "alerts:*"];
const adminPermissions = ["*"];

describe("adminEditLeadQASession", () => {
	const created = {
		userIds: [] as string[],
		leadIds: [] as string[],
	};

	beforeAll(async () => {
		await db
			.insert(roles)
			.values([
				{ id: "role-caller", name: "Caller", permissions: callerPermissions },
				{ id: "role-closer", name: "Closer", permissions: closerPermissions },
				{ id: "role-admin", name: "Admin", permissions: adminPermissions },
			])
			.onConflictDoNothing();
	});

	afterEach(async () => {
		if (created.leadIds.length > 0) {
			await db.delete(leads).where(inArray(leads.id, created.leadIds));
		}
		if (created.userIds.length > 0) {
			await db.delete(user).where(inArray(user.id, created.userIds));
		}
		created.leadIds = [];
		created.userIds = [];
	});

	async function insertUser(input: { id: string; name: string; email: string; roleId: string }) {
		created.userIds.push(input.id);
		await db.insert(user).values(input);
		return input;
	}

	async function insertLead(input: { id: string; callerId?: string; closerId?: string; questions?: LeadQASessionItem[] }) {
		created.leadIds.push(input.id);
		await db.insert(leads).values({
			id: input.id,
			name: "Test Lead",
			email: `${input.id}@test.com`,
			phone: "123456789",
			callerId: input.callerId ?? null,
			closerId: input.closerId ?? null,
			questions: input.questions ?? [],
		});
		return input;
	}

	function buildContext(userId: string, roleId: string, permissions: string[]) {
		return {
			session: {
				user: {
					id: userId,
					roleId,
					name: "Test",
					email: "test@example.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			},
			role: { id: roleId, name: roleId, permissions },
			permissions,
		} as Context;
	}

	it("overwrites the full Q&A session when caller is an admin", async () => {
		const adminId = crypto.randomUUID();
		const leadId = crypto.randomUUID();

		await insertUser({ id: adminId, name: "Admin", email: `${adminId}@test.com`, roleId: "role-admin" });
		await insertLead({ id: leadId });

		const questions = [
			{ questionKey: "q1", question: "Q1", answer: "A1" },
			{ questionKey: "q2", question: "Q2", answer: "A2" },
		];

		const updated = await adminEditLeadQASession({
			ctx: buildContext(adminId, "role-admin", adminPermissions),
			input: { leadId, isContacted: "Si", questions },
		});

		expect(updated.questions).toEqual(questions);
		const stored = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
		expect(stored?.questions).toEqual(questions.map((question) => ({ ...question, authorRole: "caller", authorId: adminId })));
		const [administrativeEvent] = await db
			.select({ kind: leadActivityEvents.kind, actorRole: leadActivityEvents.actorRole, metadata: leadActivityEvents.metadata })
			.from(leadActivityEvents)
			.where(eq(leadActivityEvents.leadId, leadId))
			.orderBy(desc(leadActivityEvents.occurredAt))
			.limit(1);
		expect(administrativeEvent).toMatchObject({
			kind: "caller_feedback",
			actorRole: "admin",
			metadata: { activitySource: "administrative_qa_edit" },
		});
	});

	it("rejects a caller without wildcard permission", async () => {
		const callerId = crypto.randomUUID();
		const leadId = crypto.randomUUID();

		await insertUser({ id: callerId, name: "Caller", email: `${callerId}@test.com`, roleId: "role-caller" });
		await insertLead({ id: leadId });

		await expect(
			adminEditLeadQASession({
				ctx: buildContext(callerId, "role-caller", callerPermissions),
				input: { leadId, isContacted: "Si", questions: [] },
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		const unchanged = await db.query.leads.findFirst({
			where: (table, { eq }) => eq(table.id, leadId),
		});
		expect(unchanged?.questions).toEqual([]);
	});

	it("rejects a closer without wildcard permission", async () => {
		const closerId = crypto.randomUUID();
		const leadId = crypto.randomUUID();

		await insertUser({ id: closerId, name: "Closer", email: `${closerId}@test.com`, roleId: "role-closer" });
		await insertLead({ id: leadId, closerId });

		await expect(
			adminEditLeadQASession({
				ctx: buildContext(closerId, "role-closer", closerPermissions),
				input: { leadId, isContacted: "Si", questions: [] },
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		const unchanged = await db.query.leads.findFirst({
			where: (table, { eq }) => eq(table.id, leadId),
		});
		expect(unchanged?.questions).toEqual([]);
	});
});

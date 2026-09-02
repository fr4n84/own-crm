import { db, inArray, asc } from "@crm-fran/db";
import { user } from "@crm-fran/db/schema/index";
import { CLOSER_ROLE_IDS } from "@crm-fran/db/schema/auth";

export async function listClosers() {
	return await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
		})
		.from(user)
		.where(inArray(user.roleId, [...CLOSER_ROLE_IDS]))
		.orderBy(asc(user.name));
}

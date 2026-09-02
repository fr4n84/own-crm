export function isCloserOf(
	lead: { closerId: string | null },
	userId: string,
): boolean {
	return lead.closerId !== null && lead.closerId === userId;
}

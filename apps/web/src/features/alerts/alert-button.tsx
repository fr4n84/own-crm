"use client";

import { useEffect, useRef } from "react";
import { Bell } from "lucide-react";

import { Button } from "@crm-fran/ui/components/button";
import { Badge } from "@crm-fran/ui/components/badge";
import { toast } from "sonner";

import { useAlertsCount } from "./use-alerts";

export function AlertButton() {
	const { data: count = 0, isLoading } = useAlertsCount();
	const prevCountRef = useRef(count);

	// Detect new alerts and show toast
	useEffect(() => {
		if (!isLoading && prevCountRef.current !== undefined && count > prevCountRef.current) {
			const newAlerts = count - prevCountRef.current;
			toast.warning(`${newAlerts} alerta${newAlerts > 1 ? "s" : ""} nueva${newAlerts > 1 ? "s" : ""}`, {
				description: "Hacé clic para verlas",
				action: {
					label: "Ver",
					onClick: () => { window.location.href = "/alerts"; },
				},
				duration: 8000,
			});
		}
		prevCountRef.current = count;
	}, [count, isLoading]);

	if (isLoading) {
		return (
			<Button variant="ghost" size="icon" disabled>
				<Bell className="h-5 w-5 animate-pulse" />
			</Button>
		);
	}

	return (
		<Button
			variant="ghost"
			size="icon"
			className="relative"
			onClick={() => { window.location.href = "/alerts"; }}
		>
			<Bell className="h-5 w-5" />
			{count > 0 && (
				<Badge
					className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full px-1 text-[10px] bg-destructive text-destructive-foreground"
					variant="destructive"
				>
					{count > 9 ? "9+" : count}
				</Badge>
			)}
		</Button>
	);
}
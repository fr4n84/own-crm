"use client";

import * as React from "react";
import { CalendarIcon, XIcon } from "lucide-react";
import { cn } from "@crm-fran/ui/lib/utils";
import { Button } from "@crm-fran/ui/components/button";
import { Calendar } from "@crm-fran/ui/components/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@crm-fran/ui/components/popover";

interface DateRangePickerProps {
  from?: string; // ISO date "YYYY-MM-DD"
  to?: string; // ISO date "YYYY-MM-DD"
  onChange: (range: { from?: string; to?: string }) => void;
  className?: string;
}

function parseDate(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const parts = iso.split("-");
  if (parts.length !== 3) return undefined;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return undefined;
  }

  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return undefined;
  }

  return date;
}

function formatDate(date?: Date): string {
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toISOString(date?: Date): string | undefined {
  if (!date) return undefined;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
}: DateRangePickerProps) {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);

  const handleFromSelect = (date: Date | undefined) => {
    if (date && toDate && date > toDate) return;
    onChange({
      from: toISOString(date),
      to,
    });
  };

  const handleToSelect = (date: Date | undefined) => {
    if (date && fromDate && date < fromDate) return;
    onChange({
      from,
      to: toISOString(date),
    });
  };

  const handleClear = () => {
    onChange({ from: undefined, to: undefined });
  };

  const hasValue = from || to;

  return (
    <div className={cn("flex items-center gap-2", className)} data-testid="date-range-picker">
      {/* From date */}
      <Popover>
        <PopoverTrigger
          render={(props) => (
            <Button
              {...props}
              variant="outline"
              className={cn(
                "w-auto justify-start text-left font-normal",
                !from && "text-muted-foreground"
              )}
            >
              <CalendarIcon data-icon="inline-start" />
              {fromDate ? formatDate(fromDate) : "Pick a date"}
            </Button>
          )}
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={fromDate}
            onSelect={handleFromSelect}
            disabled={toDate ? { after: toDate } : undefined}
          />
        </PopoverContent>
      </Popover>

      <span className="text-muted-foreground">to</span>

      {/* To date */}
      <Popover>
        <PopoverTrigger
          render={(props) => (
            <Button
              {...props}
              variant="outline"
              className={cn(
                "w-auto justify-start text-left font-normal",
                !to && "text-muted-foreground"
              )}
            >
              <CalendarIcon data-icon="inline-start" />
              {toDate ? formatDate(toDate) : "Pick a date"}
            </Button>
          )}
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={toDate}
            onSelect={handleToSelect}
            disabled={fromDate ? { before: fromDate } : undefined}
          />
        </PopoverContent>
      </Popover>

      {/* Clear button */}
      {hasValue && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClear}
          aria-label="Clear date range"
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}

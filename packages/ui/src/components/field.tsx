"use client";

import * as React from "react";

import { cn } from "@crm-fran/ui/lib/utils";
import { Label } from "./label";

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex flex-col gap-6", className)}
      {...props}
    />
  );
}

interface FieldProps extends React.ComponentProps<"div"> {
  invalid?: boolean;
}

function Field({ invalid, className, ...props }: FieldProps) {
  return (
    <div
      data-slot="field"
      data-invalid={invalid ? "" : undefined}
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={className} {...props} />;
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-error"
      className={cn("text-xs text-destructive", className)}
      {...props}
    />
  );
}

export { FieldGroup, Field, FieldLabel, FieldDescription, FieldError };

import * as React from "react";

import { cn } from "@crm-fran/ui/lib/utils";

interface EmptyProps extends React.ComponentProps<"div"> {
  heading?: React.ReactNode;
  description?: React.ReactNode;
}

function Empty({
  className,
  heading,
  description,
  children,
  ...props
}: EmptyProps) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-10 text-center",
        className,
      )}
      {...props}
    >
      {heading && <p className="text-sm font-medium">{heading}</p>}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}

export { Empty };

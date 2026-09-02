"use client";

import type { ReactNode } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@crm-fran/ui/components/drawer";
import { Button } from "@crm-fran/ui/components/button";
import { XIcon } from "lucide-react";

interface LeadDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  type: "view" | "edit";
  description?: string;
  /**
   * id del <form> activo dentro del drawer. El botón Guardar del footer
   * se asocia a ese form para disparar su submit. Si no se provee,
   * el footer se renderiza sin botón Guardar (degradación segura).
   */
  submitFormId?: string;
  /** Label del botón Guardar del footer. Default: "Guardar". */
  submitLabel?: string;
  children: ReactNode;
}

export default function LeadDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  type,
  submitFormId,
  submitLabel = "Guardar",
}: LeadDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="flex h-dvh max-h-dvh max-w-xl flex-col p-0">
        <DrawerHeader className="relative border-b px-4 py-4 pr-16 sm:px-6 sm:py-5">
          <DrawerTitle className="truncate">{title}</DrawerTitle>

          {description && <DrawerDescription>{description}</DrawerDescription>}
          <DrawerClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2"
                aria-label="Cerrar ficha del lead"
              />
            }
          >
            <XIcon />
          </DrawerClose>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-6">{children}</div>

        {type === "edit" && (
          <DrawerFooter className="border-t bg-popover px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>

              {submitFormId && (
                <Button type="submit" form={submitFormId}>
                  {submitLabel}
                </Button>
              )}
            </div>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}

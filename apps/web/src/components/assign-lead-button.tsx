// Import trpc
import { trpc } from "@/utils/trpc";

// Import React Hooks
import Loader from "@/components/loader";
import { useQueryClient } from "@tanstack/react-query";
import { useTrpcMutationWithToast } from "@/lib/use-trpc-mutation-with-toast";
import { Button } from "@crm-fran/ui/components/button";

export default function AssignLeadButton({
  children,
  leadId,
  closeDialog,
  onSuccess,
}: {
  children: React.ReactNode;
  leadId: string;
  closeDialog: () => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();

  const { mutate, isPending } = useTrpcMutationWithToast(
    trpc.leads.assignLeadToCaller.mutationOptions(),
    {
      success: "Lead asignado correctamente",
      error: "Error al asignar el lead",
    },
  );

  const assignLeadFn = () => {
    mutate(
      { id: leadId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: trpc.leads.listAll.queryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.leads.listWithoutAssigned.queryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.leads.listByUserId.queryKey(),
          });
          closeDialog();
          onSuccess?.();
        },
      },
    );
  };
  return (
    <Button disabled={isPending} onClick={assignLeadFn}>
      {children} {isPending && <Loader />}
    </Button>
  );
}

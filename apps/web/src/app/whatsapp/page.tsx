import { WhatsappQueue } from "@/features/whatsapp/whatsapp-queue";
import { Can } from "@crm-fran/ui/permissions/can";

export default function WhatsappPage() {
  return <Can permission="leads:read"><WhatsappQueue /></Can>;
}

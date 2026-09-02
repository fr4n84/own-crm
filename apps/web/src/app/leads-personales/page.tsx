import { AssignedLeadsTable } from "@/features/leads/assigned-leads-table";

export default function PersonalLeadsPage() {
  return (
    <AssignedLeadsTable
      type="maestra"
      title="Leads personales"
      description="Leads de tipo maestra en los que participas como caller o closer. La cartera se limita a tus asignaciones; los administradores conservan su vista de supervisión."
      overlayClassName="dashboard-arc-theme"
    />
  );
}

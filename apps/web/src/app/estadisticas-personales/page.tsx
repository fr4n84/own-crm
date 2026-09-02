import { Can } from "@crm-fran/ui/permissions/can";

import { PersonalStatisticsView } from "@/features/personal-statistics/personal-statistics-view";

export default function PersonalStatisticsPage() {
  return <Can permission="leads:read"><PersonalStatisticsView /></Can>;
}

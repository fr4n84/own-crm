import { Can } from "@crm-fran/ui/permissions/can";

import { FeedbackStatisticsView } from "@/features/feedback-statistics/feedback-statistics-view";

export default function FeedbackPage() {
  return (
    <Can permission="leads:read">
      <FeedbackStatisticsView />
    </Can>
  );
}

import { useTranslation } from "react-i18next";

import RequestsList from "@/features/requests/RequestsList";

export default function AllRequestsPage() {
  const { t } = useTranslation();
  return (
    <RequestsList
      title={t("requests.allTitle")}
      subtitle={t("requests.allSubtitle")}
      detailBasePath="/admin/requests"
      showAssignee
      unassignedFilter
    />
  );
}

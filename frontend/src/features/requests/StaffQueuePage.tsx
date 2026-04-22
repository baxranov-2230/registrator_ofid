import { useTranslation } from "react-i18next";

import RequestsList from "@/features/requests/RequestsList";

export default function StaffQueuePage() {
  const { t } = useTranslation();
  return (
    <RequestsList
      title={t("requests.queueTitle")}
      subtitle={t("requests.queueSubtitle")}
      detailBasePath="/staff/requests"
    />
  );
}

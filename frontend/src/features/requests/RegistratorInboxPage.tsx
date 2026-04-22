import { useTranslation } from "react-i18next";

import RequestsList from "@/features/requests/RequestsList";

export default function RegistratorInboxPage() {
  const { t } = useTranslation();
  return (
    <RequestsList
      title={t("requests.inboxTitle")}
      subtitle={t("requests.inboxSubtitle")}
      detailBasePath="/registrator/requests"
      showAssignee
      unassignedFilter
    />
  );
}

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
      triageFilters
      // Routing lands each faculty's requests on its registrator; that queue is
      // what they open the inbox for. "All" is one click away.
      defaultLens="mine"
    />
  );
}

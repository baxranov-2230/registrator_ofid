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
      // Requests are routed straight to the faculty's staff, so the registrator
      // opens the inbox to oversee all of them; "mine" holds only the ones that
      // fell back to them because a faculty had no staff bound.
      defaultLens=""
    />
  );
}

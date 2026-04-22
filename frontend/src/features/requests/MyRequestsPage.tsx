import { useTranslation } from "react-i18next";
import { Box, Button, Stack } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";

import RequestsList from "@/features/requests/RequestsList";

export default function MyRequestsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end" mb={-6}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate("/student/requests/new")}
          sx={{ position: "relative", zIndex: 1 }}
        >
          {t("nav.newRequest")}
        </Button>
      </Stack>
      <RequestsList
        title={t("requests.myTitle")}
        subtitle={t("requests.mySubtitle")}
        detailBasePath="/student/requests"
      />
    </Box>
  );
}

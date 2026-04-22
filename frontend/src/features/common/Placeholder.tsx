import { Box, Typography } from "@mui/material";

export default function Placeholder({ title }: { title: string }) {
  return (
    <Box sx={{ py: 6, textAlign: "center" }}>
      <Typography variant="h4" gutterBottom>
        {title}
      </Typography>
      <Typography color="text.secondary">
        Bu sahifa keyingi sprintda (Sprint 2 / 3) to'ldiriladi.
      </Typography>
    </Box>
  );
}

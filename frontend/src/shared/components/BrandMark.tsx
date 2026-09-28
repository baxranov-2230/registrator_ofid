import { Box } from "@mui/material";

export default function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Box aria-hidden sx={{ width: size, height: size, flexShrink: 0, position: "relative", display: "grid", placeItems: "center", bgcolor: "primary.main", color: "#fff", borderRadius: "10px", fontWeight: 700, fontSize: size * 0.55, lineHeight: 1 }}>
      R
      <Box sx={{ position: "absolute", right: -3, top: -3, width: size * 0.25, height: size * 0.25, borderRadius: "50%", bgcolor: "secondary.main", border: "2px solid", borderColor: "background.paper" }} />
    </Box>
  );
}

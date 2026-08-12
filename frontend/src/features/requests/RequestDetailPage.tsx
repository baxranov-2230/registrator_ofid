import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SendIcon from "@mui/icons-material/Send";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import DownloadIcon from "@mui/icons-material/Download";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1";
import HistoryIcon from "@mui/icons-material/History";

import type { RootState } from "@/app/store";
import { API_URL } from "@/shared/api/base";
import {
  useAddMessageMutation,
  useGetRequestQuery,
  useUploadRequestFileMutation,
  type RequestStatus,
} from "@/features/requests/requestsApi";
import { PRIORITY_COLOR, STATUS_COLOR } from "@/features/requests/statusMeta";
import AssignDialog from "@/features/requests/AssignDialog";
import RequestActions from "@/features/requests/RequestActions";
import RequestProgress from "@/features/requests/RequestProgress";
import { formatApiError } from "@/shared/api/errors";

export default function RequestDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const requestId = Number(id);
  const currentUser = useSelector((s: RootState) => s.auth.user);
  const role = currentUser?.role.name;

  const { data, isLoading, error } = useGetRequestQuery(requestId, {
    skip: !requestId,
  });
  const [addMessage, msgState] = useAddMessageMutation();
  const [uploadFile, uploadState] = useUploadRequestFileMutation();

  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canTransition = role === "staff" || role === "registrator" || role === "admin";
  const canAssign = role === "registrator" || role === "admin";

  /** Newest history comment — explains a return or rejection to the student. */
  const lastComment = useMemo(() => {
    if (!data?.history?.length) return null;
    for (let i = data.history.length - 1; i >= 0; i -= 1) {
      if (data.history[i].comment) return data.history[i].comment;
    }
    return null;
  }, [data]);

  const accessToken = useSelector((s: RootState) => s.auth.accessToken);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    if (!message.trim()) return;
    try {
      await addMessage({
        id: requestId,
        content: message.trim(),
        is_internal: isInternal,
      }).unwrap();
      setMessage("");
      setIsInternal(false);
    } catch (e: unknown) {
      setActionErr(formatApiError(e, t("common.error")));
    }
  };

  const handleFilePicked = async (file: File) => {
    setActionErr(null);
    try {
      await uploadFile({ id: requestId, file }).unwrap();
    } catch (e: unknown) {
      setActionErr(formatApiError(e, t("common.error")));
    }
  };

  const handleDownload = async (fileId: number, name: string) => {
    try {
      const resp = await fetch(`${API_URL}/api/v1/requests/${requestId}/files/${fileId}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!resp.ok) throw new Error("download failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setActionErr(t("common.error"));
    }
  };

  if (isLoading) {
    return (
      <Typography color="text.secondary">{t("common.loading")}</Typography>
    );
  }
  if (error || !data) {
    return <Alert severity="error">{t("common.error")}</Alert>;
  }

  return (
    <Box sx={{ width: "100%" }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={2}>
        <IconButton onClick={() => navigate(-1)} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary">
          {t("common.back")}
        </Typography>
      </Stack>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
                <Chip
                  label={t(`requests.status.${data.status}`)}
                  size="small"
                  sx={{
                    bgcolor: STATUS_COLOR[data.status] + "15",
                    color: STATUS_COLOR[data.status],
                    fontWeight: 700,
                  }}
                />
                <Chip
                  label={t(`requests.priority.${data.priority}`)}
                  size="small"
                  variant="outlined"
                  sx={{
                    color: PRIORITY_COLOR[data.priority] || "#64748B",
                    borderColor: (PRIORITY_COLOR[data.priority] || "#64748B") + "55",
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  {data.tracking_no}
                </Typography>
                {/* Show the full path the student picked: type → service. */}
                <Typography variant="body2" color="text.secondary">
                  {data.service_type ? `· ${data.service_type.name} → ` : "· "}
                  {data.category?.name}
                </Typography>
              </Stack>
              <Typography variant="h5" fontWeight={700} mb={1}>
                {data.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                {data.description}
              </Typography>
            </Box>

            <Box sx={{ minWidth: 260 }}>
              <Stack spacing={1.5}>
                <InfoRow
                  label={t("requests.from")}
                  value={data.student?.full_name || t("requests.unknownUser")}
                />
                <InfoRow
                  label={t("requests.assignee")}
                  value={data.assignee?.full_name || t("requests.notAssignedYet")}
                />
                <InfoRow
                  label={t("requests.createdAtLabel")}
                  value={new Date(data.created_at).toLocaleString()}
                />
                <InfoRow
                  label={t("requests.sla")}
                  value={new Date(data.sla_deadline).toLocaleString()}
                />
              </Stack>
            </Box>
          </Stack>

          <Divider sx={{ my: 3 }} />

          {/* Everyone sees where the request stands, including the student. */}
          <RequestProgress status={data.status} lastComment={lastComment} />

          {role === "student" && !["completed", "rejected", "returned"].includes(data.status) && (
            <Alert severity="info" sx={{ mt: 2 }} icon={false}>
              <Typography variant="caption" fontWeight={700} display="block">
                {t("requests.whatNext")}
              </Typography>
              {t("requests.whatNextStudent")}
            </Alert>
          )}

          {(canAssign || canTransition) && (
            <>
              <Divider sx={{ my: 3 }} />
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                alignItems={{ md: "flex-start" }}
                justifyContent="space-between"
              >
                {canTransition && <RequestActions request={data} role={role} />}
                {canAssign && (
                  <Button
                    variant="outlined"
                    startIcon={<PersonAddIcon />}
                    onClick={() => setAssignOpen(true)}
                    sx={{ flexShrink: 0 }}
                  >
                    {data.assigned_to ? t("requests.assign") : t("requests.assignTitle")}
                  </Button>
                )}
              </Stack>
              {actionErr && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {actionErr}
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
        <Box sx={{ flex: 2, minWidth: 0 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={700} mb={2}>
                {t("requests.messagesTitle")}
              </Typography>

              <Stack spacing={1.5} sx={{ mb: 2, maxHeight: 420, overflowY: "auto" }}>
                {data.messages.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {t("requests.noMessages")}
                  </Typography>
                )}
                {data.messages.map((m) => {
                  const mine = currentUser?.id === m.sender_id;
                  return (
                    <Paper
                      key={m.id}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        bgcolor: m.is_internal
                          ? "#FEF3C7"
                          : mine
                            ? "primary.main"
                            : "background.default",
                        color: mine && !m.is_internal ? "white" : "inherit",
                        alignSelf: mine ? "flex-end" : "flex-start",
                        maxWidth: "80%",
                        ml: mine ? "auto" : 0,
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                        <Avatar sx={{ width: 24, height: 24, fontSize: 12 }}>
                          {(mine ? t("requests.you") : m.sender_name || "?")
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </Avatar>
                        <Typography variant="caption" fontWeight={700} sx={{ opacity: 0.95 }}>
                          {mine ? t("requests.you") : m.sender_name || t("requests.unknownUser")}
                          {m.sender_role && !mine && ` · ${t(`role.${m.sender_role}`)}`}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.75 }}>
                          {new Date(m.created_at).toLocaleString()}
                        </Typography>
                        {m.is_internal && (
                          <Chip
                            label={t("requests.internalBadge")}
                            size="small"
                            sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                          />
                        )}
                      </Stack>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {m.content}
                      </Typography>
                    </Paper>
                  );
                })}
              </Stack>

              <form onSubmit={handleSendMessage}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <TextField
                    fullWidth
                    size="small"
                    placeholder={t("requests.messagePlaceholder")}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    multiline
                    maxRows={5}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    startIcon={<SendIcon />}
                    disabled={!message.trim() || msgState.isLoading}
                  >
                    {t("requests.send")}
                  </Button>
                </Stack>
                {/* Staff can post either to the student or to colleagues only,
                    so the selector has to say which one is in effect. */}
                {role !== "student" && (
                  <TextField
                    select
                    size="small"
                    label={t("requests.messageTypeLabel")}
                    value={isInternal ? "1" : "0"}
                    onChange={(e) => setIsInternal(e.target.value === "1")}
                    sx={{ mt: 1.5, minWidth: 260 }}
                    helperText={
                      isInternal ? t("requests.internalOnly") : t("requests.publicMessage")
                    }
                  >
                    <MenuItem value="0">{t("requests.publicMessage")}</MenuItem>
                    <MenuItem value="1">{t("requests.internalOnly")}</MenuItem>
                  </TextField>
                )}
              </form>
            </CardContent>
          </Card>

          <Card sx={{ mt: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6" fontWeight={700}>
                  {t("requests.filesTitle")}
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AttachFileIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadState.isLoading}
                >
                  {t("requests.uploadFile")}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFilePicked(f);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                />
              </Stack>
              {data.files.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("requests.noFiles")}
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {data.files.map((f) => (
                    <Stack
                      key={f.id}
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{
                        p: 1,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                      }}
                    >
                      <AttachFileIcon fontSize="small" />
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {f.file_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {(f.file_size / 1024).toFixed(1)} KB ·{" "}
                          {new Date(f.created_at).toLocaleString()}
                        </Typography>
                      </Box>
                      <Tooltip title={t("requests.download")}>
                        <IconButton
                          size="small"
                          onClick={() => handleDownload(f.id, f.file_name)}
                        >
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: 1, minWidth: 280 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                <HistoryIcon fontSize="small" color="action" />
                <Typography variant="h6" fontWeight={700}>
                  {t("requests.historyTitle")}
                </Typography>
              </Stack>
              <Stack spacing={2}>
                {data.history.map((h) => (
                  <Box key={h.id} sx={{ pl: 2, borderLeft: "3px solid", borderColor: "primary.main" }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {h.old_status && (
                        <Chip
                          label={t(`requests.status.${h.old_status}`)}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      <Typography variant="caption">→</Typography>
                      <Chip
                        label={t(`requests.status.${h.new_status}`)}
                        size="small"
                        sx={{
                          bgcolor:
                            STATUS_COLOR[h.new_status as RequestStatus] + "15",
                          color: STATUS_COLOR[h.new_status as RequestStatus],
                          fontWeight: 600,
                        }}
                      />
                    </Stack>
                    {h.comment && (
                      <Typography variant="body2" color="text.secondary" mt={0.5}>
                        {h.comment}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.disabled" display="block">
                      {h.changed_by_name && (
                        <>
                          {h.changed_by_name}
                          {h.changed_by_role && ` · ${t(`role.${h.changed_by_role}`)}`}
                          {" — "}
                        </>
                      )}
                      {new Date(h.created_at).toLocaleString()}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Stack>

      {assignOpen && (
        <AssignDialog
          requestId={data.id}
          facultyId={data.faculty_id}
          departmentId={data.department_id}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600} textAlign="right" sx={{ maxWidth: "60%" }}>
        {value}
      </Typography>
    </Stack>
  );
}

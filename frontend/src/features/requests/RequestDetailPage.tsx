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
  useTransitionRequestMutation,
  useUploadRequestFileMutation,
  type RequestStatus,
} from "@/features/requests/requestsApi";
import { PRIORITY_COLOR, STATUS_COLOR } from "@/features/requests/statusMeta";
import AssignDialog from "@/features/requests/AssignDialog";

const TRANSITIONS_BY_STATUS: Record<RequestStatus, RequestStatus[]> = {
  new: ["accepted", "rejected", "returned"],
  accepted: ["in_progress", "rejected", "returned"],
  in_progress: ["completed", "rejected", "returned"],
  returned: ["accepted", "new"],
  completed: [],
  rejected: [],
};

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
  const [transition, transitionState] = useTransitionRequestMutation();
  const [uploadFile, uploadState] = useUploadRequestFileMutation();

  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<RequestStatus | "">("");
  const [transitionComment, setTransitionComment] = useState("");
  const [actionErr, setActionErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTransitions = useMemo(
    () => (data ? TRANSITIONS_BY_STATUS[data.status] : []),
    [data],
  );

  const canTransition = role === "staff" || role === "registrator" || role === "admin";
  const canAssign = role === "registrator" || role === "admin";

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
      const detail = (e as { data?: { detail?: string } }).data?.detail;
      setActionErr(detail || t("common.error"));
    }
  };

  const handleTransition = async () => {
    if (!transitionTarget) return;
    setActionErr(null);
    try {
      await transition({
        id: requestId,
        data: {
          status: transitionTarget as RequestStatus,
          comment: transitionComment.trim() || null,
        },
      }).unwrap();
      setTransitionTarget("");
      setTransitionComment("");
    } catch (e: unknown) {
      const detail = (e as { data?: { detail?: string } }).data?.detail;
      setActionErr(detail || t("common.error"));
    }
  };

  const handleFilePicked = async (file: File) => {
    setActionErr(null);
    try {
      await uploadFile({ id: requestId, file }).unwrap();
    } catch (e: unknown) {
      const detail = (e as { data?: { detail?: string } }).data?.detail;
      setActionErr(detail || t("common.error"));
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
    <Box sx={{ maxWidth: 1100, mx: "auto" }}>
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
                <Typography variant="body2" color="text.secondary">
                  · {data.category?.name}
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

          {(canAssign || canTransition) && (
            <>
              <Divider sx={{ my: 3 }} />
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                {canAssign && (
                  <Button
                    variant="outlined"
                    startIcon={<PersonAddIcon />}
                    onClick={() => setAssignOpen(true)}
                  >
                    {data.assigned_to ? t("requests.assign") : t("requests.assignTitle")}
                  </Button>
                )}
                {canTransition && allowedTransitions.length > 0 && (
                  <>
                    <TextField
                      select
                      size="small"
                      label={t("requests.status.new")}
                      value={transitionTarget}
                      onChange={(e) => setTransitionTarget(e.target.value as RequestStatus)}
                      sx={{ minWidth: 200 }}
                    >
                      <MenuItem value="">—</MenuItem>
                      {allowedTransitions.map((s) => (
                        <MenuItem key={s} value={s}>
                          {t(`requests.status.${s}`)}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      size="small"
                      label={t("requests.transitionComment")}
                      value={transitionComment}
                      onChange={(e) => setTransitionComment(e.target.value)}
                      sx={{ flexGrow: 1, minWidth: 200 }}
                    />
                    <Button
                      variant="contained"
                      onClick={handleTransition}
                      disabled={!transitionTarget || transitionState.isLoading}
                    >
                      {t("common.confirm")}
                    </Button>
                  </>
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
                          {String(m.sender_id)[0]}
                        </Avatar>
                        <Typography variant="caption" sx={{ opacity: 0.85 }}>
                          {new Date(m.created_at).toLocaleString()}
                          {m.is_internal && ` · ${t("requests.internalNote")}`}
                        </Typography>
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
                {role !== "student" && (
                  <TextField
                    select
                    size="small"
                    value={isInternal ? "1" : "0"}
                    onChange={(e) => setIsInternal(e.target.value === "1")}
                    sx={{ mt: 1, minWidth: 240 }}
                  >
                    <MenuItem value="0">{t("requests.messagesTitle")}</MenuItem>
                    <MenuItem value="1">{t("requests.internalNote")}</MenuItem>
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
                    <Typography variant="caption" color="text.disabled">
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

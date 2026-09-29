import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  type ChipProps,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import DownloadIcon from "@mui/icons-material/Download";
import HistoryIcon from "@mui/icons-material/History";
import TaskAltIcon from "@mui/icons-material/TaskAlt";

import type { RootState } from "@/app/store";
import {
  useDownloadRequestFileMutation,
  useGetRequestQuery,
  type RequestFileOut,
  type RequestStatus,
} from "@/features/requests/requestsApi";
import { PRIORITY_COLOR, STATUS_COLOR } from "@/features/requests/statusMeta";
import { formatDateTime, formatDuration } from "@/features/requests/format";
import AssignDialog from "@/features/requests/AssignDialog";
import RequestActions from "@/features/requests/RequestActions";
import RequestProgress from "@/features/requests/RequestProgress";

const FOUR_HOURS = 4 * 60 * 60 * 1000;

/** The SLA job logs its escalations as "[sla-warning] …" / "[sla-breach] …". */
const SLA_MARKER = /^\[(sla-warning|sla-breach)\]\s*/;

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
  const [downloadFile] = useDownloadRequestFileMutation();

  const [assignOpen, setAssignOpen] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const canTransition = role === "staff" || role === "registrator" || role === "admin";
  const canAssign = role === "registrator" || role === "admin";
  const isClosed = data?.status === "completed" || data?.status === "rejected";
  // The server lets staff move only the requests assigned to them.
  const canAct =
    canTransition && (role !== "staff" || data?.assigned_to === currentUser?.id);

  const handleDownload = async (fileId: number, name: string) => {
    setFileErr(null);
    try {
      const url = await downloadFile({ id: requestId, fileId }).unwrap();
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setFileErr(t("common.error"));
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

  /** How the deadline stands right now, in words rather than a bare date. */
  const sla: { label: string; color: ChipProps["color"] } | null = (() => {
    if (isClosed) return null;
    if (data.sla_paused_at) return { label: t("requests.slaPaused"), color: "default" };
    const left = new Date(data.sla_deadline).getTime() - now;
    if (data.is_overdue || left <= 0) {
      return { label: t("requests.slaOver", { time: formatDuration(left, t) }), color: "error" };
    }
    return {
      label: t("requests.slaLeft", { time: formatDuration(left, t) }),
      color: left < FOUR_HOURS ? "warning" : "success",
    };
  })();

  const priorityColor = PRIORITY_COLOR[data.priority] || "#64748B";
  // What the student sent with the request. Answer files sit with the answer.
  const attachments = data.files.filter((f) => !f.is_answer);

  return (
    <Box sx={{ width: "100%" }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(-1)}
        color="inherit"
        sx={{ mb: 2, color: "text.secondary" }}
      >
        {t("common.back")}
      </Button>

      <Stack direction={{ xs: "column", lg: "row" }} spacing={3} alignItems="flex-start">
        {/* Main column: what the request is, where it stands, the conversation. */}
        <Stack spacing={3} sx={{ flex: 1, minWidth: 0, width: "100%" }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {data.tracking_no}
              </Typography>
              <Typography variant="h5" fontWeight={700} mt={0.5} sx={{ wordBreak: "break-word" }}>
                {data.title}
              </Typography>
              <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap" useFlexGap>
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
                  label={`${t("requests.priorityLabel")}: ${t(`requests.priority.${data.priority}`)}`}
                  size="small"
                  variant="outlined"
                  sx={{ color: priorityColor, borderColor: priorityColor + "55" }}
                />
              </Stack>

              <Typography variant="overline" color="text.secondary" display="block" mt={2.5}>
                {t("requests.descriptionLabel")}
              </Typography>
              <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {data.description}
              </Typography>

              {attachments.length > 0 && (
                <>
                  <Typography variant="overline" color="text.secondary" display="block" mt={2.5}>
                    {t("requests.attachmentsLabel")}
                  </Typography>
                  <Stack spacing={1} mt={0.5}>
                    {attachments.map((f) => (
                      <FileRow key={f.id} file={f} onDownload={handleDownload} />
                    ))}
                  </Stack>
                </>
              )}
              {fileErr && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {fileErr}
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* The outcome, once there is one, sits right under the question. */}
          {data.answer && (
            <Card sx={{ borderLeft: "4px solid", borderColor: "success.main" }}>
              <CardContent sx={{ p: 3 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  alignItems={{ sm: "center" }}
                  spacing={0.5}
                  mb={1.5}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TaskAltIcon color="success" />
                    <Typography variant="h6" fontWeight={700}>
                      {t("requests.finalAnswerTitle")}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {data.answer.answered_by_name && `${data.answer.answered_by_name} · `}
                    {formatDateTime(data.answer.answered_at)}
                  </Typography>
                </Stack>
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {data.answer.text}
                </Typography>
                {data.answer.files.length > 0 && (
                  <Stack spacing={1} mt={2}>
                    {data.answer.files.map((f) => (
                      <FileRow key={f.id} file={f} onDownload={handleDownload} />
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={700} mb={3}>
                {t("requests.progressTitle")}
              </Typography>
              <RequestProgress status={data.status} history={data.history} />

              {canAct && !isClosed && (
                <>
                  <Divider sx={{ my: 3 }} />
                  <RequestActions request={data} />
                </>
              )}
              {canTransition && !canAct && !isClosed && (
                <Typography variant="body2" color="text.secondary" mt={2}>
                  {t("requests.notYourRequest")}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Stack>

        {/* Side column: the facts about the request and its audit trail. */}
        <Stack spacing={3} sx={{ width: { xs: "100%", lg: 360 }, flexShrink: 0 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={700} mb={2}>
                {t("requests.detailsTitle")}
              </Typography>
              <Stack spacing={2} divider={<Divider flexItem />}>
                <InfoItem label={t("requests.serviceLabel")}>
                  <InfoValue>{data.category?.name}</InfoValue>
                  {data.service_type && (
                    <Typography variant="caption" color="text.secondary">
                      {data.service_type.name}
                    </Typography>
                  )}
                </InfoItem>
                <InfoItem label={t("requests.studentLabel")}>
                  <InfoValue>{data.student?.full_name || t("requests.unknownUser")}</InfoValue>
                </InfoItem>
                <InfoItem
                  label={t("requests.assignee")}
                  action={
                    canAssign && (
                      <Button size="small" onClick={() => setAssignOpen(true)} sx={{ py: 0 }}>
                        {data.assigned_to ? t("requests.reassign") : t("requests.assign")}
                      </Button>
                    )
                  }
                >
                  <InfoValue muted={!data.assignee}>
                    {data.assignee?.full_name || t("requests.notAssignedYet")}
                  </InfoValue>
                </InfoItem>
                <InfoItem label={t("requests.createdAtLabel")}>
                  <InfoValue>{formatDateTime(data.created_at)}</InfoValue>
                </InfoItem>
                <InfoItem label={t("requests.deadlineLabel")}>
                  <InfoValue>{formatDateTime(data.sla_deadline)}</InfoValue>
                  {sla && (
                    <Chip
                      label={sla.label}
                      color={sla.color}
                      size="small"
                      variant="outlined"
                      sx={{ mt: 0.75, fontWeight: 600 }}
                    />
                  )}
                </InfoItem>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                <HistoryIcon fontSize="small" color="action" />
                <Typography variant="h6" fontWeight={700}>
                  {t("requests.historyTitle")}
                </Typography>
              </Stack>
              <Box>
                {data.history.map((h, i) => {
                  const isCreate = !h.old_status;
                  const isTransition = !isCreate && h.old_status !== h.new_status;
                  const color = STATUS_COLOR[h.new_status as RequestStatus] ?? "#64748B";
                  const isLast = i === data.history.length - 1;
                  const slaMatch = h.comment?.match(SLA_MARKER);
                  const isBreach = slaMatch?.[1] === "sla-breach";
                  const comment = slaMatch ? h.comment!.slice(slaMatch[0].length) : h.comment;
                  const dotColor =
                    isCreate || isTransition
                      ? color
                      : slaMatch
                        ? isBreach
                          ? "error.main"
                          : "warning.main"
                        : "grey.400";
                  return (
                    <Stack key={h.id} direction="row" spacing={1.5}>
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            mt: 0.75,
                            borderRadius: "50%",
                            flexShrink: 0,
                            bgcolor: dotColor,
                          }}
                        />
                        {!isLast && <Box sx={{ flexGrow: 1, width: 2, my: 0.5, bgcolor: "divider" }} />}
                      </Box>
                      <Box sx={{ pb: isLast ? 0 : 2.5, minWidth: 0 }}>
                        {isCreate && (
                          <Typography variant="body2" fontWeight={700}>
                            {t("requests.historyCreated")}
                          </Typography>
                        )}
                        {isTransition && (
                          <Typography variant="body2" fontWeight={700}>
                            <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>
                              {t(`requests.status.${h.old_status}`)}
                            </Box>
                            {" → "}
                            <Box component="span" sx={{ color }}>
                              {t(`requests.status.${h.new_status}`)}
                            </Box>
                          </Typography>
                        )}
                        {slaMatch && (
                          <Typography
                            variant="body2"
                            fontWeight={700}
                            color={isBreach ? "error.main" : "warning.main"}
                          >
                            {isBreach ? t("requests.historySlaBreach") : t("requests.historySlaWarning")}
                          </Typography>
                        )}
                        {comment && (
                          <Typography
                            variant="body2"
                            color={isCreate || isTransition || slaMatch ? "text.secondary" : "text.primary"}
                            sx={{ wordBreak: "break-word" }}
                          >
                            {comment}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.disabled" display="block" mt={0.25}>
                          {h.changed_by_name && (
                            <>
                              {h.changed_by_name}
                              {h.changed_by_role && ` · ${t(`role.${h.changed_by_role}`)}`}
                              {" — "}
                            </>
                          )}
                          {formatDateTime(h.created_at)}
                        </Typography>
                      </Box>
                    </Stack>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
        </Stack>
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

function FileRow({
  file,
  onDownload,
}: {
  file: RequestFileOut;
  onDownload: (id: number, name: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ p: 1, border: "1px solid", borderColor: "divider", borderRadius: 1 }}
    >
      <AttachFileIcon fontSize="small" />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {file.file_name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {(file.file_size / 1024).toFixed(1)} KB · {formatDateTime(file.created_at)}
        </Typography>
      </Box>
      <Tooltip title={t("requests.download")}>
        <IconButton size="small" onClick={() => onDownload(file.id, file.file_name)}>
          <DownloadIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function InfoItem({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" minHeight={24}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        {action}
      </Stack>
      {children}
    </Box>
  );
}

function InfoValue({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <Typography
      variant="body2"
      fontWeight={600}
      color={muted ? "text.secondary" : "text.primary"}
      sx={{ wordBreak: "break-word" }}
    >
      {children}
    </Typography>
  );
}

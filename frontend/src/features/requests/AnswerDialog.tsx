import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";

import { useAnswerRequestMutation } from "@/features/requests/requestsApi";
import { formatApiError } from "@/shared/api/errors";

/** Mirrors MAX_ANSWER_FILES on the server. */
const MAX_FILES = 10;

interface Props {
  requestId: number;
  onClose: () => void;
}

/**
 * "Javob berish": the final answer, as text with optional files. Sending it is
 * what closes the request, and it is what the student sees as the outcome.
 */
export default function AnswerDialog({ requestId, onClose }: Props) {
  const { t } = useTranslation();
  const [answer, state] = useAnswerRequestMutation();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    setFiles((prev) => [...prev, ...Array.from(picked)].slice(0, MAX_FILES));
  };

  const submit = async () => {
    if (!text.trim()) {
      setErr(t("requests.answerTextRequired"));
      return;
    }
    setErr(null);
    try {
      await answer({ id: requestId, text: text.trim(), files }).unwrap();
      onClose();
    } catch (e: unknown) {
      setErr(formatApiError(e, t("common.error")));
    }
  };

  return (
    <Dialog open onClose={state.isLoading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("requests.answerTitle")}</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("requests.answerNotice")}
        </Alert>
        {err && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {err}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={5}
          required
          label={t("requests.answerText")}
          placeholder={t("requests.answerPlaceholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <Box mt={2}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AttachFileIcon />}
            onClick={() => inputRef.current?.click()}
            disabled={files.length >= MAX_FILES || state.isLoading}
          >
            {t("requests.answerAttach")}
          </Button>
          <Typography variant="caption" color="text.secondary" ml={1.5}>
            {t("requests.answerFilesHint", { max: MAX_FILES })}
          </Typography>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {files.length > 0 && (
            <Stack spacing={0.75} mt={1.5}>
              {files.map((f, i) => (
                <Stack
                  key={`${f.name}-${i}`}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ px: 1, py: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}
                >
                  <AttachFileIcon fontSize="small" color="action" />
                  <Typography variant="body2" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                    {f.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" flexShrink={0}>
                    {(f.size / 1024).toFixed(1)} KB
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label={t("common.delete")}
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={state.isLoading}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          color="success"
          startIcon={<SendIcon />}
          onClick={submit}
          disabled={state.isLoading || !text.trim()}
        >
          {t("requests.answerSubmit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

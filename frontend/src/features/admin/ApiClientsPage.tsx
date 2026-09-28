import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import KeyIcon from "@mui/icons-material/VpnKeyOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import BlockIcon from "@mui/icons-material/BlockOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline";
import CopyIcon from "@mui/icons-material/ContentCopy";

import type { ApiClientCredentials, ApiClientOut, ApiScope } from "@/features/admin/adminApi";
import {
  API_SCOPES,
  useCreateApiClientMutation,
  useListApiClientsQuery,
  useRotateApiClientSecretMutation,
  useUpdateApiClientMutation,
} from "@/features/admin/adminApi";
import { formatApiError } from "@/shared/api/errors";

/** i18next reads ":" as a namespace separator, so scopes need a key of their own. */
const scopeKey = (scope: ApiScope) => `apiClients.scope.${scope.replace(":", "_")}`;

export default function ApiClientsPage() {
  const { t } = useTranslation();
  const { data: clients = [], isLoading } = useListApiClientsQuery();
  const [dialog, setDialog] = useState<{ edit?: ApiClientOut } | null>(null);
  const [credentials, setCredentials] = useState<ApiClientCredentials | null>(null);
  const [update] = useUpdateApiClientMutation();
  const [rotate] = useRotateApiClientSecretMutation();
  const [err, setErr] = useState<string | null>(null);

  const handleRotate = async (c: ApiClientOut) => {
    if (!window.confirm(t("apiClients.rotateConfirm", { name: c.name }))) return;
    setErr(null);
    try {
      setCredentials(await rotate(c.id).unwrap());
    } catch (e: unknown) {
      setErr(formatApiError(e, t("common.error")));
    }
  };

  const handleToggle = async (c: ApiClientOut) => {
    if (c.is_active && !window.confirm(t("apiClients.deactivateConfirm", { name: c.name }))) return;
    setErr(null);
    try {
      await update({ id: c.id, data: { is_active: !c.is_active } }).unwrap();
    } catch (e: unknown) {
      setErr(formatApiError(e, t("common.error")));
    }
  };

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={2} mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            {t("nav.apiClients")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("apiClients.subtitle")}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDialog({})}>
          {t("apiClients.newClient")}
        </Button>
      </Stack>

      <Alert severity="info" icon={<KeyIcon />} sx={{ mb: 3 }}>
        {t("apiClients.hint")}
      </Alert>

      {err && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ border: "1px solid", borderColor: "divider" }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: "background.default" }}>
              <TableCell>{t("apiClients.columns.name")}</TableCell>
              <TableCell>{t("apiClients.columns.clientId")}</TableCell>
              <TableCell>{t("apiClients.columns.scopes")}</TableCell>
              <TableCell>{t("apiClients.columns.status")}</TableCell>
              <TableCell>{t("apiClients.columns.lastUsed")}</TableCell>
              <TableCell align="right">{t("common.actions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">{t("common.loading")}</Typography>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <Stack alignItems="center" spacing={1}>
                    <KeyIcon sx={{ fontSize: 48, color: "text.disabled" }} />
                    <Typography color="text.secondary">{t("apiClients.empty")}</Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            )}
            {clients.map((c) => (
              <TableRow key={c.id} hover sx={{ opacity: c.is_active ? 1 : 0.6 }}>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    {c.name}
                  </Typography>
                  {c.description && (
                    <Typography variant="caption" color="text.secondary">
                      {c.description}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                      {c.client_id}
                    </Typography>
                    <CopyButton value={c.client_id} />
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {c.scopes.map((s) => (
                      <Tooltip key={s} title={t(scopeKey(s))}>
                        <Chip label={s} size="small" variant="outlined" sx={{ fontFamily: "monospace" }} />
                      </Tooltip>
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={c.is_active ? "success" : "default"}
                    label={c.is_active ? t("apiClients.active") : t("apiClients.inactive")}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {c.last_used_at ? new Date(c.last_used_at).toLocaleString() : t("apiClients.never")}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  <Tooltip title={t("common.edit")}>
                    <IconButton size="small" aria-label={t("common.edit")} onClick={() => setDialog({ edit: c })}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t("apiClients.rotate")}>
                    <span>
                      <IconButton size="small" aria-label={t("apiClients.rotate")} onClick={() => handleRotate(c)} disabled={!c.is_active}>
                        <AutorenewIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={c.is_active ? t("common.deactivate") : t("common.activate")}>
                    <IconButton
                      size="small"
                      aria-label={c.is_active ? t("common.deactivate") : t("common.activate")}
                      color={c.is_active ? "error" : "success"}
                      onClick={() => handleToggle(c)}
                    >
                      {c.is_active ? <BlockIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {dialog && (
        <ClientDialog
          edit={dialog.edit}
          onClose={() => setDialog(null)}
          onCreated={(created) => {
            setDialog(null);
            setCredentials(created);
          }}
        />
      )}
      {credentials && <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />}
    </Box>
  );
}

function ClientDialog({
  edit,
  onClose,
  onCreated,
}: {
  edit?: ApiClientOut;
  onClose: () => void;
  onCreated: (created: ApiClientCredentials) => void;
}) {
  const { t } = useTranslation();
  const [create, createState] = useCreateApiClientMutation();
  const [update, updateState] = useUpdateApiClientMutation();
  const saving = createState.isLoading || updateState.isLoading;
  const [name, setName] = useState(edit?.name ?? "");
  const [description, setDescription] = useState(edit?.description ?? "");
  const [scopes, setScopes] = useState<ApiScope[]>(edit?.scopes ?? ["requests:read", "requests:write", "catalogs:read"]);
  const [err, setErr] = useState<string | null>(null);

  const toggleScope = (scope: ApiScope) =>
    setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const payload = { name: name.trim(), description: description.trim() || null, scopes };
    try {
      if (edit) {
        await update({ id: edit.id, data: payload }).unwrap();
        onClose();
      } else {
        onCreated(await create(payload).unwrap());
      }
    } catch (e: unknown) {
      setErr(formatApiError(e, t("common.error")));
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{edit ? t("apiClients.editClient") : t("apiClients.newClient")}</DialogTitle>
        <DialogContent>
          {err && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {err}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("apiClients.form.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
              inputProps={{ minLength: 2, maxLength: 255 }}
            />
            <TextField
              label={t("apiClients.form.description")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              inputProps={{ maxLength: 500 }}
            />
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {t("apiClients.form.scopes")}
              </Typography>
              <FormGroup>
                {API_SCOPES.map((scope) => (
                  <FormControlLabel
                    key={scope}
                    control={<Checkbox checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />}
                    label={
                      <Box>
                        <Typography variant="body2">{t(scopeKey(scope))}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                          {scope}
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: "flex-start", mb: 1, "& .MuiCheckbox-root": { pt: 0.5 } }}
                  />
                ))}
              </FormGroup>
              {scopes.length === 0 && <FormHelperText error>{t("apiClients.form.scopesHint")}</FormHelperText>}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="contained" disabled={saving || scopes.length === 0}>
            {t("common.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * Shows the secret the one time it exists in plaintext. Only the button
 * closes it: a stray backdrop click must not lose a secret that cannot be
 * shown again.
 */
function CredentialsDialog({ credentials, onClose }: { credentials: ApiClientCredentials; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open maxWidth="sm" fullWidth disableEscapeKeyDown>
      <DialogTitle>
        {t("apiClients.secretTitle")}: {credentials.name}
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t("apiClients.secretWarning")}
        </Alert>
        <Stack spacing={2}>
          <SecretField label={t("apiClients.clientId")} value={credentials.client_id} />
          <SecretField label={t("apiClients.clientSecret")} value={credentials.client_secret} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          {t("apiClients.savedIt")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SecretField({ label, value }: { label: string; value: string }) {
  return (
    <TextField
      label={label}
      value={value}
      fullWidth
      InputProps={{
        readOnly: true,
        sx: { fontFamily: "monospace" },
        endAdornment: <CopyButton value={value} />,
      }}
      onFocus={(e) => e.target.select()}
    />
  );
}

function CopyButton({ value }: { value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard needs a secure context; the field is still selectable by hand.
    }
  };

  return (
    <Tooltip title={copied ? t("apiClients.copied") : t("apiClients.copy")}>
      <IconButton size="small" aria-label={t("apiClients.copy")} onClick={handleCopy}>
        <CopyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

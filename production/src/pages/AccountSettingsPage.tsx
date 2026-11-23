import { useEffect, useRef, useState, type ReactNode } from "react";
import { isPaidPlan, planLabel } from "../lib/plan-tiers";
import { Link, useNavigate } from "react-router-dom";
import { Camera, Copy } from "lucide-react";
import { api, ApiError, MCP_URL, fileToBase64 } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canBuyPlans, canSell } from "../lib/native";
import { creditsFromMillicredits, formatCredits } from "../lib/tokens";
import { TwoFactorSetup } from "../components/TwoFactor";
import { WorkspaceAvatar } from "../components/settings/kit";
import { fetchWorkspaces } from "../lib/workspaceCatalog";
import type { WorkspaceSummary } from "../lib/api";
import { BillingShell, BILLING_CARD } from "../components/billing/BillingShell";
import { PasswordInput } from "../components/AuthShell";
import { btnClass, whiteBtnClass } from "../lib/surfaces";
import { Reveal } from "../components/chat/motion";
import { useToast } from "../components/ui";
import { LanguageSelect } from "../components/LanguageSetting";
import { fill, formatDate, formatRelative, pl, useT } from "../i18n/app";
import { rich } from "../i18n/app/rich";
import {
  currentPlatform,
  ensureRegistered,
  openSystemNotificationSettings,
  readNotificationState,
  requestNotifications,
} from "../lib/notification-controls";
import {
  notificationOffer,
  notificationStatusLabel,
  type NotificationState,
} from "../lib/notification-state";
import { AppVersionLine } from "../components/AppVersionLine";

export function AccountSettingsPage() {
  const { user, refresh, logout } = useAuth();
  const toast = useToast();
  const t = useT();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const isPro = isPaidPlan(user?.plan);
  const mcpUrl = MCP_URL;

  /**
   * The platform is the source of truth, not a stored preference: the setting
   * lives in the OS or the browser and can be changed there without telling
   * the app, so it is read on mount and re-read whenever this page comes back
   * into view — which is exactly what happens after a trip to Settings.
   */
  const [notifyState, setNotifyState] = useState<NotificationState | null>(null);
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void readNotificationState().then((state) => {
        if (cancelled) return;
        setNotifyState(state);
        // Turned on from the system settings rather than from here: nothing
        // has registered this device, and on one that never granted before
        // there is no token at all yet.
        if (state === "granted") void ensureRegistered((path: string) => navigate(path));
      });
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", read);
    };
  }, []);

  /** "On · 3 memories" on the Memory row — one line of state, not a page. */
  const [memoryState, setMemoryState] = useState<{ enabled: boolean; count: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ settings: { memoryEnabled: boolean }; memories: unknown[] }>("/v1/memory")
      .then((r) => {
        if (cancelled) return;
        setMemoryState({ enabled: r.settings.memoryEnabled, count: r.memories.length });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const [editingName, setEditingName] = useState(false);
  // Focused once the form has slid open, and without scrolling: `autoFocus`
  // fired while it was still 0px tall and the browser scrolled to it mid-slide.
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editingName) return;
    const timer = setTimeout(() => nameInputRef.current?.focus({ preventScroll: true }), 300);
    return () => clearTimeout(timer);
  }, [editingName]);
  const [editingPassword, setEditingPassword] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [nameDraft, setNameDraft] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  const errMsg = (err: unknown, fallback: string) =>
    (err instanceof ApiError && (err.body as { message?: string })?.message) || fallback;

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast("success", fill(t.settings.account.copiedLabel, { label }));
    } catch {
      toast("error", t.settings.account.copyFailed);
    }
  };

  const turnOnNotifications = async () => {
    setBusy("notify");
    try {
      const state = await requestNotifications((path) => navigate(path));
      setNotifyState(state);
      toast(
        state === "granted" ? "success" : "error",
        state === "granted"
          ? t.settings.account.notifyOn
          : t.settings.account.notifyDenied,
      );
    } finally {
      setBusy(null);
    }
  };

  /**
   * The only route back once the platform has stopped asking. Nothing is
   * refreshed here on purpose — the state is re-read when this page comes
   * back into view, which is when the answer has actually changed.
   */
  const openNotificationSettings = async () => {
    if (!(await openSystemNotificationSettings())) {
      toast("error", t.settings.account.notifyOpenBrowser);
    }
  };

  const changeName = async () => {
    const name = nameDraft.trim();
    if (name.length < 1) {
      toast("error", t.settings.account.nameEmpty);
      return;
    }
    setBusy("name");
    try {
      await api.patch("/v1/account/name", { name });
      await refresh();
      toast("success", t.settings.account.nameUpdated);
      setEditingName(false);
    } catch (err) {
      toast("error", errMsg(err, t.settings.account.nameFailed));
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async () => {
    setBusy("password");
    try {
      await api.post("/v1/account/password", { currentPassword, newPassword });
      toast("success", t.settings.account.passwordUpdated);
      setCurrentPassword("");
      setNewPassword("");
      setEditingPassword(false);
    } catch (err) {
      toast("error", errMsg(err, t.settings.account.passwordFailed));
    } finally {
      setBusy(null);
    }
  };

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("error", t.settings.account.photoNotImage);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast("error", t.settings.account.photoTooBig);
      return;
    }
    setBusy("avatar");
    try {
      const data = await fileToBase64(file);
      await api.post<{ ok: boolean; avatarUrl: string }>("/v1/account/avatar", {
        filename: file.name,
        contentType: file.type || "image/jpeg",
        data,
      });
      await refresh();
      toast("success", t.settings.account.photoUpdated);
    } catch (err) {
      toast("error", errMsg(err, t.settings.account.photoFailed));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    setBusy("avatar");
    try {
      await api.delete("/v1/account/avatar");
      await refresh();
      toast("success", t.settings.account.photoRemoved);
    } catch (err) {
      toast("error", errMsg(err, t.settings.account.photoRemoveFailed));
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    if (user?.hasPassword && !deletePassword) {
      toast("error", t.settings.account.deletePasswordNeeded);
      return;
    }
    setBusy("delete");
    try {
      await api.delete("/v1/account", {
        confirm: "DELETE",
        ...(user?.hasPassword ? { password: deletePassword } : {}),
      });
      await logout().catch(() => {});
      navigate("/signup");
    } catch (err) {
      toast("error", errMsg(err, t.settings.account.deleteFailed));
      setBusy(null);
    }
  };

  const initial = (user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase();
  const a = t.settings.account;
  // Worded at render, so a language change rewords it too.
  const memorySummary = !memoryState
    ? ""
    : !memoryState.enabled
      ? t.common.off
      : memoryState.count === 0
        ? a.memoryOnEmpty
        : pl(a.memoryOnCount, memoryState.count);

  return (
    <BillingShell>
      <div className="mx-auto w-full max-w-2xl pb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">{a.title}</h1>
        <p className="mt-1 text-sm text-white/50">{a.subtitle}</p>

        <Section title={a.profileTitle} description={a.profileDescription}>
          <Card>
            <div className="flex items-center gap-4 px-4 py-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy === "avatar"}
                className="group relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 text-lg font-semibold text-white transition hover:opacity-90"
                aria-label={a.uploadPhotoAria}
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  initial
                )}
                <span className="absolute inset-0 grid place-items-center bg-black/45 transition md:opacity-0 md:group-hover:opacity-100">
                  <Camera className="size-5 text-white" />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{a.profilePhoto}</p>
                <p className="mt-0.5 text-xs text-white/45">{a.photoHint}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy === "avatar"}
                    className="shrink-0 rounded-[8px] bg-white px-3 py-1.5 text-sm font-medium text-[#141413] transition hover:bg-[#f0ebe3] disabled:opacity-50"
                  >
                    {busy === "avatar" ? a.uploading : t.common.upload}
                  </button>
                  {user?.avatarUrl && (
                    <button
                      type="button"
                      onClick={() => void removePhoto()}
                      disabled={busy === "avatar"}
                      className="shrink-0 rounded-[8px] px-3 py-1.5 text-sm text-muted transition hover:bg-white/[0.04] hover:text-red-400 disabled:opacity-50"
                    >
                      {t.common.remove}
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => void onPickPhoto(e.target.files?.[0])}
              />
            </div>
            {/* One part of the card: the row and, sliding open under it, the
                form — no line between the label and what edits it. */}
            <div>
              <Row
                label={a.name}
                value={user?.name ?? "—"}
                editing={editingName}
                action={
                  <GhostBtn
                    onClick={() => {
                      setNameDraft(user?.name ?? "");
                      setEditingName(true);
                    }}
                  >
                    {a.change}
                  </GhostBtn>
                }
              />
              <Reveal show={editingName}>
                <div className="space-y-3 px-4 pb-4">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder={a.namePlaceholder}
                    autoComplete="name"
                    maxLength={80}
                    className="input"
                    ref={nameInputRef}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void changeName()}
                      disabled={busy !== null || nameDraft.trim().length < 1}
                      className={whiteBtnClass("lg")}
                    >
                      {busy === "name" ? t.common.saving : a.saveName}
                    </button>
                    <GhostBtn
                      onClick={() => {
                        setEditingName(false);
                        setNameDraft("");
                      }}
                    >
                      {t.common.cancel}
                    </GhostBtn>
                  </div>
                </div>
              </Reveal>
            </div>
            <Row label={a.email} value={user?.email ?? "—"} />
          </Card>
        </Section>

        {/* Plan and balance, stated rather than sold.
        
            The app has no billing screen — guideline 3.1.1, see `canSell` — so
            until now someone on Pro could open a phone and find no way to tell
            which plan they were on or what was left on it. Saying so is not
            selling: what the rule forbids is a route to buy, which is why the
            button beside it only exists on the web. */}
        <Section title={t.common.language} description={t.common.languageDescription}>
          <Card>
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <p className="text-sm text-white/50">{t.common.language}</p>
              <LanguageSelect />
            </div>
          </Card>
        </Section>

        <Section title={a.planTitle} description={a.planDescription}>
          <Card>
            <Row
              label={a.plan}
              value={planLabel(user?.plan)}
              action={
                canBuyPlans() ? (
                  <GhostBtn onClick={() => navigate("/billing?highlight=plans")}>{t.common.manage}</GhostBtn>
                ) : undefined
              }
            />
            <Row
              label={a.credits}
              value={formatCredits(
                user?.balanceCredits ?? creditsFromMillicredits(user?.balanceTokens ?? 0),
              )}
            />
          </Card>
        </Section>

        <Section title={a.securityTitle} description={a.securityDescription}>
          <Card>
            <div>
              <Row
                label={a.password}
                value="••••••••"
                editing={editingPassword}
                action={<GhostBtn onClick={() => setEditingPassword(true)}>{a.change}</GhostBtn>}
              />
              <Reveal show={editingPassword}>
                <div className="space-y-3 px-4 pb-4">
                  <p className="text-xs text-white/45">{a.passwordHint}</p>
                  <PasswordInput
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    placeholder={a.currentPassword}
                    autoComplete="off"
                  />
                  <PasswordInput
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder={a.newPassword}
                    autoComplete="off"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void changePassword()}
                      disabled={
                        busy !== null || currentPassword.length < 1 || newPassword.length < 8
                      }
                      className={whiteBtnClass("lg")}
                    >
                      {busy === "password" ? a.updating : a.updatePassword}
                    </button>
                    <GhostBtn
                      onClick={() => {
                        setEditingPassword(false);
                        setCurrentPassword("");
                        setNewPassword("");
                      }}
                    >
                      {t.common.cancel}
                    </GhostBtn>
                  </div>
                </div>
              </Reveal>
            </div>
            <div id="two-factor">
              <Row
                label={t.teams.account.twoFactor}
                value={user?.twoFactor?.enabled ? t.teams.account.twoFactorOn : t.common.off}
                action={
                  <TwoFactorSetup
                    enabled={Boolean(user?.twoFactor?.enabled)}
                    required={new URLSearchParams(window.location.search).get("setup2fa") === "required"}
                    onChanged={() => void refresh({ force: true })}
                  />
                }
              />
            </div>
          </Card>
        </Section>

        <RecentSignIns />

        {notifyState && notifyState !== "unsupported" && (
          <Section
            title={a.notificationsTitle}
            description={a.notificationsDescription}
          >
            <Card>
              <Row
                label={a.notifications}
                value={notificationStatusLabel(notifyState)}
                action={(() => {
                  const offer = notificationOffer(notifyState, currentPlatform());
                  if (offer.kind === "ask") {
                    return (
                      <GhostBtn
                        onClick={() => void turnOnNotifications()}
                        disabled={busy === "notify"}
                      >
                        {busy === "notify" ? a.asking : offer.label}
                      </GhostBtn>
                    );
                  }
                  if (offer.kind === "open-settings") {
                    return (
                      <GhostBtn onClick={() => void openNotificationSettings()}>
                        {offer.label}
                      </GhostBtn>
                    );
                  }
                  return undefined;
                })()}
              />
              {(() => {
                const offer = notificationOffer(notifyState, currentPlatform());
                const hint = offer.kind === "open-settings" || offer.kind === "explain" ? offer.hint : null;
                // Why no prompt is coming. Without it a blocked row reads as a
                // bug rather than a decision the person made.
                return hint ? (
                  <p className="px-4 py-3 text-[13px] text-white/45">
                    {hint}
                  </p>
                ) : null;
              })()}
            </Card>
          </Section>
        )}

        <Section title={t.teams.account.title} description={t.teams.account.description}>
          <Card>
            <TeamRow />
          </Card>
        </Section>

        <Section
          title={a.memoryTitle}
          description={a.memoryDescription}
        >
          <Card>
            <Row
              label={a.memory}
              value={memorySummary}
              action={
                <GhostBtn onClick={() => navigate("/settings/memory")}>{t.common.manage}</GhostBtn>
              }
            />
          </Card>
        </Section>

        {/* Your invite link and who signed up through it. */}
        {canSell() && (
          <Section title={t.referrals.account.title} description={fill(t.referrals.account.description, { invitee: 10, referrer: 100 })}>
            <Card>
              <Row
                label={t.referrals.account.row}
                value={t.referrals.account.rowValue}
                action={<GhostBtn onClick={() => navigate("/settings/referrals")}>{t.common.manage}</GhostBtn>}
              />
            </Card>
          </Section>
        )}

        <Section
          title={a.mcpTitle}
          description={a.mcpDescription}
        >
          <Card>
            <div className="space-y-3 px-4 py-4 text-sm text-white/60">
              <p>
                {rich(a.mcpSteps, {
                  b: (s) => <span className="font-medium text-white/80">{s}</span>,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code dir="ltr" className="rounded bg-black/30 px-2 py-1 text-xs text-white/80">{mcpUrl}</code>
                <GhostBtn onClick={() => void copyText(mcpUrl, a.mcpUrl)}>
                  <span className="inline-flex items-center gap-1">
                    <Copy className="size-3.5" /> {t.common.copy}
                  </span>
                </GhostBtn>
              </div>
              {!isPro && (
                <p className="text-amber-200/80">
                  {rich(a.mcpFreeNote, {
                    pro: (s) =>
                      canBuyPlans() ? (
                        <Link to="/billing" className="text-sky-300 hover:underline">
                          {s}
                        </Link>
                      ) : (
                        s
                      ),
                  })}
                </p>
              )}
              <p className="text-xs text-white/40">
                {rich(a.mcpBilling, {
                  guide: (s) => (
                    <a
                      href="https://docs.mythex.ai/features/mcp"
                      className="text-white/60 underline hover:text-white"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s}
                    </a>
                  ),
                })}
              </p>
            </div>
          </Card>
        </Section>

        <Section
          title={a.dangerTitle}
          description={a.dangerDescription}
        >
          <Card>
            {!confirmingDelete ? (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{a.deleteAccount}</p>
                  <p className="mt-0.5 text-xs text-white/45">{a.deleteAccountHint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
                >
                  {a.deleteAccount}
                </button>
              </div>
            ) : (
              <div className="space-y-3 px-4 py-4">
                <p className="text-sm text-white/60">
                  {rich(a.deleteConfirm, {
                    word: <span className="font-mono font-semibold text-red-400">DELETE</span>,
                  })}
                </p>
                <input
                  value={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.value)}
                  placeholder="DELETE"
                  name="delete-confirmation"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className="input border-red-500/40 focus:border-red-500 focus:ring-red-500/30"
                />
                {/* The password once DELETE is typed, not beside it from the
                    start: iOS read a text field above a password field as a
                    login's username and offered saved Passwords over the
                    keyboard while you typed DELETE (in the simulator; no bar
                    with the password field gone). */}
                {user?.hasPassword && confirmDelete === "DELETE" ? (
                  <PasswordInput
                    value={deletePassword}
                    onChange={setDeletePassword}
                    placeholder={a.currentPassword}
                    autoComplete="current-password"
                  />
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void deleteAccount()}
                    disabled={
                      busy !== null ||
                      confirmDelete !== "DELETE" ||
                      Boolean(user?.hasPassword && !deletePassword)
                    }
                    className="btn-danger !h-9 !rounded-lg px-4 text-sm"
                  >
                    {busy === "delete" ? t.common.deleting : a.deleteMyAccount}
                  </button>
                  <GhostBtn
                    onClick={() => {
                      setConfirmingDelete(false);
                      setConfirmDelete("");
                      setDeletePassword("");
                    }}
                  >
                    {t.common.cancel}
                  </GhostBtn>
                </div>
              </div>
            )}
          </Card>
        </Section>
        <AppVersionLine />
      </div>
    </BillingShell>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/45">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * A settings card. The hairlines between its parts are the card's, drawn
 * between neighbours only — each row drawing its own bottom line left one
 * over the card's rounded edge at the end (`last:border-b-0` only drops the
 * border, and the line here is a shadow), doubling it.
 */
function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-line [&>*+*]:shadow-[inset_0_0.5px_0_0_var(--mx-line)]"
      style={{ background: BILLING_CARD }}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  action,
  editing = false,
}: {
  label: string;
  value: string;
  action?: ReactNode;
  /**
   * The row's own form is open under it. The value slides shut and the action
   * fades as the form slides open — both on the form's clock, so nothing in
   * the row snaps out first and makes the card jump before the slide begins.
   */
  editing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white/50">{label}</p>
        {value ? (
          <Reveal show={!editing}>
            <p className="mt-0.5 truncate text-sm font-medium text-white">{value}</p>
          </Reveal>
        ) : null}
      </div>
      {action ? (
        <div
          className={`shrink-0 transition-opacity duration-200 ${editing ? "pointer-events-none opacity-0" : "opacity-100"}`}
          aria-hidden={editing}
        >
          {action}
        </div>
      ) : null}
    </div>
  );
}

type SignIn = {
  id: string;
  at: string;
  device: string;
  location: string | null;
  ip: string | null;
  method: string;
  twoFactor: boolean;
  thisDevice: boolean;
};

/**
 * Account settings → Recent sign-ins: the last ten, and a way to sign every
 * other device out. The "new sign-in" email links here (#sign-ins). Strings:
 * t.security.
 */
function RecentSignIns() {
  const toast = useToast();
  const t = useT();
  const ts = t.security;
  const [list, setList] = useState<SignIn[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ signIns: SignIn[] }>("/v1/auth/sign-ins")
      .then((r) => {
        if (!cancelled) setList(r.signIns);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Opened from the email: bring the list into view once it's there.
  useEffect(() => {
    if (list && window.location.hash === "#sign-ins") ref.current?.scrollIntoView({ block: "start" });
  }, [list]);

  const signOutOthers = async () => {
    setBusy(true);
    try {
      await api.post("/v1/auth/sessions/revoke-others");
      toast("success", ts.signOutOthers.done);
      setConfirming(false);
    } catch (err) {
      toast("error", (err instanceof ApiError && (err.body as { message?: string })?.message) || ts.signOutOthers.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="sign-ins" ref={ref} className="scroll-mt-6">
      <Section
        title={ts.signIns.title}
        description={ts.signIns.description}
      >
        <Card>
          {list === null ? (
            <div className="h-[68px]" />
          ) : list.length === 0 ? (
            <p className="px-4 py-3.5 text-sm text-white/45">{ts.signIns.empty}</p>
          ) : (
            list.map((s) => {
              const method = (ts.signIns.methods as Record<string, string>)[s.method];
              const details = [s.location, s.ip, method ? (s.twoFactor ? fill(ts.signIns.withTwoFactor, { method }) : method) : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid="sign-in-row">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-white">
                      <span className="truncate">{s.device}</span>
                      {s.thisDevice && (
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                          {ts.signIns.thisDevice}
                        </span>
                      )}
                    </p>
                    {details ? (
                      <p dir="ltr" className="mt-0.5 truncate text-[13px] text-white/50">
                        {details}
                      </p>
                    ) : null}
                  </div>
                  <time
                    dateTime={s.at}
                    title={formatDate(s.at, { dateStyle: "medium", timeStyle: "short" })}
                    className="shrink-0 text-[13px] text-white/45"
                  >
                    {formatRelative(s.at)}
                  </time>
                </div>
              );
            })
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{ts.signOutOthers.title}</p>
              <p className="mt-0.5 text-xs text-white/45">
                {confirming
                  ? ts.signOutOthers.confirm
                  : ts.signOutOthers.hint}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {confirming ? (
                <>
                  <button
                    type="button"
                    onClick={() => void signOutOthers()}
                    disabled={busy}
                    className={whiteBtnClass("lg")}
                    data-testid="sign-out-others-confirm"
                  >
                    {busy ? ts.signOutOthers.signingOut : ts.signOutOthers.button}
                  </button>
                  <GhostBtn onClick={() => setConfirming(false)} disabled={busy}>
                    {t.common.cancel}
                  </GhostBtn>
                </>
              ) : (
                <GhostBtn onClick={() => setConfirming(true)}>{ts.signOutOthers.button}</GhostBtn>
              )}
            </div>
          </div>
        </Card>
      </Section>
    </div>
  );
}

/** The raised secondary control (`btnClass`), as everywhere else. */
function GhostBtn({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={btnClass("lg")}>
      {children}
    </button>
  );
}

/**
 * Account settings is about you; this row is the way to your workspace's
 * Team page: the workspace you're in, your role, and what's waiting on you.
 */
function TeamRow() {
  const navigate = useNavigate();
  const t = useT();
  const ta = t.teams.account;
  const [list, setList] = useState<WorkspaceSummary[] | null>(null);
  useEffect(() => {
    void fetchWorkspaces({ force: true })
      .then(setList)
      .catch(() => setList([]));
  }, []);

  let stored: string | null = null;
  try {
    stored = localStorage.getItem("mythex_ws");
  } catch {
    stored = null;
  }
  const ws = list?.find((w) => w.id === stored) ?? list?.find((w) => w.isDefault) ?? list?.[0];
  if (!list) return <div className="h-[68px]" />;
  if (!ws) {
    return <Row label={ta.workspace} value="" action={<GhostBtn onClick={() => navigate("/settings/team")}>{t.common.manage}</GhostBtn>} />;
  }

  const joins = ws.pending?.joinRequests ?? 0;
  const approvals = ws.pending?.approvals ?? 0;
  const team = `/settings/team?workspace=${encodeURIComponent(ws.id)}`;
  const role = t.teams.roles[ws.role];
  const others = list.length - 1;

  return (
    <div className="flex items-center gap-3 px-4 py-3.5" data-testid="account-team-row">
      <WorkspaceAvatar name={ws.name} url={ws.avatarUrl} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          <bdi>{ws.name}</bdi>
        </p>
        <p className="truncate text-[13px] text-white/50">
          {ws.plan ? `${planLabel(ws.plan)} · ` : ""}
          {pl(ta.members, ws.memberCount)} · {fill(ta.you, { role })}
          {others > 0 ? ` · ${pl(ta.moreWorkspaces, others)}` : ""}
        </p>
        {joins + approvals > 0 && (
          <button
            type="button"
            onClick={() => navigate(joins ? `${team}&tab=people&view=requests` : `${team}&tab=approvals`)}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[12px] text-amber-200 transition hover:bg-amber-500/15"
            data-testid="account-team-pending"
          >
            {[joins ? pl(t.teams.pending.joinRequests, joins) : null, approvals ? pl(t.teams.pending.approvals, approvals) : null]
              .filter(Boolean)
              .join(" · ")}
            <span className="font-medium">· {t.teams.pending.review}</span>
          </button>
        )}
      </div>
      <div className="shrink-0">
        <GhostBtn onClick={() => navigate(team)}>{t.common.manage}</GhostBtn>
      </div>
    </div>
  );
}

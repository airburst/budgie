import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccounts } from "@/hooks/useAccounts";
import { usePreferences } from "@/hooks/usePreferences";
import {
  ArrowLeftIcon,
  FolderOpen,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import Layout from "../layout";

const STATIC_ROUTES: { value: string; label: string }[] = [
  { value: "/", label: "Dashboard" },
  { value: "/budget", label: "Budget" },
  { value: "/reports", label: "Reports" },
  { value: "/categories", label: "Categories" },
  { value: "/payees", label: "Payees" },
  { value: "/scheduled", label: "Scheduled Transactions" },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { preferences, update } = usePreferences();
  const { accounts } = useAccounts();

  // Backup folder
  const [backupFolder, setBackupFolder] = useState("");
  const [defaultBackupFolder, setDefaultBackupFolder] = useState("");

  // Backup retention
  const [retentionStr, setRetentionStr] = useState("");

  // Data folder
  const [dataFolder, setDataFolder] = useState("");
  const [pendingDataFolder, setPendingDataFolder] = useState<string | null>(
    null,
  );

  useEffect(() => {
    window.api.getDefaultBackupFolder().then(setDefaultBackupFolder);
    window.api.getDataFolder().then(setDataFolder);
  }, []);

  useEffect(() => {
    setBackupFolder(preferences.backupFolder ?? defaultBackupFolder);
    setRetentionStr(
      preferences.backupRetentionDays != null
        ? String(preferences.backupRetentionDays)
        : "30",
    );
  }, [preferences, defaultBackupFolder]);

  function savePreference(patch: Partial<typeof preferences>) {
    update.mutate({ ...preferences, ...patch });
  }

  async function handleBrowseBackup() {
    const chosen = await window.api.chooseBackupFolder();
    if (chosen) {
      setBackupFolder(chosen);
      savePreference({ backupFolder: chosen });
    }
  }

  function handleBackupFolderBlur() {
    if (backupFolder !== (preferences.backupFolder ?? defaultBackupFolder)) {
      savePreference({ backupFolder: backupFolder || undefined });
    }
  }

  function handleRetentionBlur() {
    const days = parseInt(retentionStr);
    const current = preferences.backupRetentionDays;
    if (!isNaN(days) && days > 0 && days !== current) {
      savePreference({ backupRetentionDays: days });
    }
  }

  async function handleBrowseData() {
    const chosen = await window.api.chooseDataFolder();
    if (chosen && chosen !== dataFolder) {
      setPendingDataFolder(chosen);
    }
  }

  async function handleMoveData() {
    if (!pendingDataFolder) return;
    await window.api.moveDataFolder(pendingDataFolder);
  }

  const theme = preferences.theme ?? "auto";
  const startupPage = preferences.startupPage ?? "/";

  const startupPageLabel = useMemo(() => {
    const staticMatch = STATIC_ROUTES.find((r) => r.value === startupPage);
    if (staticMatch) return staticMatch.label;
    const accountMatch = accounts.find(
      (a) => `/accounts/${a.id}` === startupPage,
    );
    return accountMatch ? accountMatch.name : "Dashboard";
  }, [startupPage, accounts]);

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-y-auto p-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ArrowLeftIcon />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        </div>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="flex flex-col gap-4 mt-4">
              {/* Appearance */}
              <div className="rounded-md border border-border p-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Appearance
                </p>
                <div className="flex items-center justify-between">
                  <Label>Theme</Label>
                  <ButtonGroup>
                    <Button
                      variant={theme === "light" ? "default" : "outline"}
                      size="icon-sm"
                      onClick={() => savePreference({ theme: "light" })}
                      aria-label="Light theme"
                      aria-pressed={theme === "light"}
                    >
                      <SunIcon />
                    </Button>
                    <Button
                      variant={theme === "auto" ? "default" : "outline"}
                      size="icon-sm"
                      onClick={() => savePreference({ theme: "auto" })}
                      aria-label="System theme"
                      aria-pressed={theme === "auto"}
                    >
                      <MonitorIcon />
                    </Button>
                    <Button
                      variant={theme === "dark" ? "default" : "outline"}
                      size="icon-sm"
                      onClick={() => savePreference({ theme: "dark" })}
                      aria-label="Dark theme"
                      aria-pressed={theme === "dark"}
                    >
                      <MoonIcon />
                    </Button>
                  </ButtonGroup>
                </div>
              </div>

              {/* Startup */}
              <div className="rounded-md border border-border p-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Startup
                </p>
                <div className="flex items-center justify-between">
                  <Label htmlFor="startup-page">Open on launch</Label>
                  <Select
                    value={startupPage}
                    onValueChange={(v) =>
                      savePreference({ startupPage: v as string })
                    }
                  >
                    <SelectTrigger id="startup-page" className="w-48">
                      <SelectValue>{startupPageLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectGroup>
                        {STATIC_ROUTES.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      {accounts.length > 0 && (
                        <>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Accounts</SelectLabel>
                            {accounts.map((account) => (
                              <SelectItem
                                key={account.id}
                                value={`/accounts/${account.id}`}
                              >
                                {account.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Transactions */}
              <div className="rounded-md border border-border p-4">
                <div className="flex items-center gap-2">
                  <input
                    id="autofill"
                    type="checkbox"
                    checked={preferences.autofillPayees}
                    onChange={(e) =>
                      savePreference({ autofillPayees: e.target.checked })
                    }
                    className="cursor-pointer"
                  />
                  <Label
                    htmlFor="autofill"
                    className="cursor-pointer font-normal"
                  >
                    Automatically fill transaction details
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-5">
                  When enabled, selecting a payee will auto-fill category and
                  amount. Payee autocomplete is always available.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="advanced">
            <div className="flex flex-col gap-4 mt-4">
              {/* Backups */}
              <div className="rounded-md border border-border p-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Backups
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="backup-folder">Backup folder</Label>
                  <div className="flex gap-2">
                    <Input
                      id="backup-folder"
                      value={backupFolder}
                      onChange={(e) => setBackupFolder(e.target.value)}
                      onBlur={handleBackupFolderBlur}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleBrowseBackup}
                    >
                      <FolderOpen className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="retention">Keep backups for</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="retention"
                      type="number"
                      min="1"
                      value={retentionStr}
                      onChange={(e) => setRetentionStr(e.target.value)}
                      onBlur={handleRetentionBlur}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">days</span>
                  </div>
                </div>
              </div>

              {/* Data */}
              <div className="rounded-md border border-border p-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Data
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="data-folder">Data folder</Label>
                  <div className="flex gap-2">
                    <Input
                      id="data-folder"
                      value={dataFolder}
                      readOnly
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleBrowseData}
                    >
                      <FolderOpen className="size-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Moving data will restart the app.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmDialog
        open={pendingDataFolder !== null}
        onOpenChange={(open) => !open && setPendingDataFolder(null)}
        title="Move data folder?"
        description={`This will copy your database to "${pendingDataFolder}" and restart the app.`}
        onConfirm={handleMoveData}
      />
    </Layout>
  );
}

const STORAGE_KEY = "clovapi-webui-state-v1";
const CUSTOM_PRESET_ID = "custom";
const DEFAULT_PROFILES = [];
const DEFAULT_PRESETS = [
  {
    id: CUSTOM_PRESET_ID,
    apiName: "custom",
    baseUrl: "",
    apiStyle: "openai",
    defaultModel: "",
  },
];
// Keep commands aligned with switcher/internal/apply (cliExecutableOnPATH).
const DEFAULT_CLIS = [
  { id: "cli-claude", name: "Claude Code", command: "claude", profileId: "" },
  { id: "cli-codex", name: "Codex", command: "codex", profileId: "" },
  { id: "cli-opencode", name: "OpenCode", command: "opencode", profileId: "" },
  { id: "cli-openclaw", name: "OpenClaw", command: "openclaw", profileId: "" },
  { id: "cli-hermes", name: "Hermes", command: "hermes", profileId: "" },
  { id: "cli-kimi-code", name: "Kimi Code", command: "kimi", profileId: "" },
];

const dom = {
  tabCli: document.getElementById("tabCli"),
  tabProfiles: document.getElementById("tabProfiles"),
  cliPanel: document.getElementById("cliPanel"),
  profilesPanel: document.getElementById("profilesPanel"),
  cliList: document.getElementById("cliList"),
  profilesList: document.getElementById("profilesList"),
  newProfileBtn: document.getElementById("newProfileBtn"),
  boundCliText: document.getElementById("boundCliText"),
  profileDialog: document.getElementById("profileDialog"),
  profileForm: document.getElementById("profileForm"),
  dialogTitle: document.getElementById("dialogTitle"),
  presetInput: document.getElementById("presetInput"),
  nameInput: document.getElementById("nameInput"),
  baseUrlInput: document.getElementById("baseUrlInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  modelInput: document.getElementById("modelInput"),
  apiStyleInput: document.getElementById("apiStyleInput"),
  cancelDialogBtn: document.getElementById("cancelDialogBtn"),
};

const state = {
  activeTab: "cli",
  profiles: DEFAULT_PROFILES.slice(),
  clis: DEFAULT_CLIS.slice(),
  running: false,
  cliDetectedPath: {},
  boundCliTool: { source: "none", path: "" },
  editingProfileId: "",
  presets: DEFAULT_PRESETS.slice(),
};

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readInitialState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.profiles) && parsed.profiles.length) {
      state.profiles = parsed.profiles.map((profile) => ({
        id: String(profile.id || createId("profile")),
        name: String(profile.name || "Unnamed"),
        baseUrl: String(profile.baseUrl || ""),
        apiKey: String(profile.apiKey || ""),
        model: String(profile.model || ""),
        apiStyle: ["openai", "anthropic", "gemini"].includes(profile.apiStyle) ? profile.apiStyle : "openai",
      }));
    }
    if (Array.isArray(parsed.clis) && parsed.clis.length) {
      state.clis = parsed.clis;
    }
  } catch {}
}

function persistState() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ profiles: state.profiles, clis: state.clis }),
  );
}

function profileEnv(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) return {};
  const env = {};
  if (profile.baseUrl) env.CLOVAPI_BASE_URL = profile.baseUrl;
  if (profile.apiKey) env.CLOVAPI_API_KEY = profile.apiKey;
  if (profile.model) env.CLOVAPI_MODEL = profile.model;
  if (profile.apiStyle === "openai") {
    if (profile.baseUrl) env.OPENAI_BASE_URL = profile.baseUrl;
    if (profile.apiKey) env.OPENAI_API_KEY = profile.apiKey;
  } else if (profile.apiStyle === "anthropic") {
    if (profile.baseUrl) env.ANTHROPIC_BASE_URL = profile.baseUrl;
    if (profile.apiKey) env.ANTHROPIC_API_KEY = profile.apiKey;
  } else if (profile.apiStyle === "gemini") {
    if (profile.baseUrl) env.GEMINI_BASE_URL = profile.baseUrl;
    if (profile.apiKey) env.GEMINI_API_KEY = profile.apiKey;
  }
  return env;
}

function setRunning(running) {
  state.running = running;
  renderCliList();
}

function setActiveTab(tab) {
  state.activeTab = tab;
  dom.tabCli.classList.toggle("active", tab === "cli");
  dom.tabProfiles.classList.toggle("active", tab === "profiles");
  dom.cliPanel.hidden = tab !== "cli";
  dom.profilesPanel.hidden = tab !== "profiles";
}

function normalizePreset(input) {
  const apiStyle = ["openai", "anthropic", "gemini"].includes(input?.apiStyle) ? input.apiStyle : "openai";
  const id = String(input?.id || "").trim();
  return {
    id: id || createId("preset"),
    apiName: String(input?.apiName || "").trim(),
    baseUrl: String(input?.baseUrl || "").trim(),
    apiStyle,
    defaultModel: String(input?.defaultModel || "").trim(),
  };
}

function renderPresetOptions(selectedId = CUSTOM_PRESET_ID) {
  if (!dom.presetInput) return;
  dom.presetInput.innerHTML = "";
  state.presets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.apiName || preset.id;
    option.selected = preset.id === selectedId;
    dom.presetInput.appendChild(option);
  });
}

function applyPresetToDialog(presetId) {
  const preset = state.presets.find((item) => item.id === presetId);
  if (!preset) return;
  dom.nameInput.value = preset.apiName || "";
  dom.baseUrlInput.value = preset.baseUrl || "";
  dom.modelInput.value = preset.defaultModel || "";
  dom.apiStyleInput.value = preset.apiStyle || "openai";
}

async function loadPresets() {
  try {
    const response = await fetch("../api-presets.template.json");
    if (!response.ok) throw new Error(`preset fetch failed: ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.presets)) throw new Error("invalid preset schema");
    const presets = data.presets.map(normalizePreset).filter((item) => item.id);
    const hasCustom = presets.some((item) => item.id === CUSTOM_PRESET_ID);
    state.presets = hasCustom ? presets : [DEFAULT_PRESETS[0], ...presets];
  } catch {
    state.presets = DEFAULT_PRESETS.slice();
  }
  renderPresetOptions(CUSTOM_PRESET_ID);
}

function renderCliList() {
  dom.cliList.innerHTML = "";
  state.clis.forEach((cli) => {
    const item = document.createElement("div");
    item.className = "cli-item";

    const info = document.createElement("div");
    info.innerHTML = `<div class="cli-title">${cli.name}</div><div class="cli-sub">${
      state.cliDetectedPath[cli.id] ? `系统已检测: ${state.cliDetectedPath[cli.id]}` : "系统未检测到该 CLI"
    }</div>`;

    const actions = document.createElement("div");
    actions.className = "cli-actions";

    const select = document.createElement("select");
    select.className = "profile-select";
    const options = [{ id: "", name: "未选择 API" }, ...state.profiles];
    options.forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name;
      option.selected = profile.id === cli.profileId;
      select.appendChild(option);
    });
    select.addEventListener("change", () => {
      cli.profileId = select.value;
      persistState();
    });

    const testBtn = document.createElement("button");
    testBtn.type = "button";
    testBtn.className = "btn";
    testBtn.textContent = "测试";
    testBtn.disabled = !state.cliDetectedPath[cli.id] || state.running;
    testBtn.addEventListener("click", () => {
      void runCliCheck(cli);
    });

    actions.appendChild(select);
    actions.appendChild(testBtn);
    item.appendChild(info);
    item.appendChild(actions);
    dom.cliList.appendChild(item);
  });
}

function renderProfiles() {
  dom.profilesList.innerHTML = "";
  state.profiles.forEach((profile) => {
    const item = document.createElement("div");
    item.className = "profile-item";
    item.innerHTML = `
      <div class="profile-name">${profile.name}</div>
      <div class="profile-meta">${profile.baseUrl}</div>
      <div class="profile-meta">model: ${profile.model || "-"}</div>
      <div class="profile-meta">apiStyle: ${profile.apiStyle}</div>
    `;
    const actions = document.createElement("div");
    actions.className = "profile-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => openProfileDialog("edit", profile.id));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn danger";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", () => removeProfile(profile.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    item.appendChild(actions);
    dom.profilesList.appendChild(item);
  });
}

function mergeCliSlotsFromDefaults() {
  const byId = new Map(state.clis.map((cli) => [cli.id, cli]));
  state.clis = DEFAULT_CLIS.map((def) => {
    const ex = byId.get(def.id);
    const profileId = ex?.profileId;
    return {
      ...def,
      profileId: typeof profileId === "string" ? profileId : "",
    };
  });
}

function normalizeCliProfile() {
  state.clis = state.clis.map((cli) => {
    if (!state.profiles.length) return { ...cli, profileId: "" };
    return state.profiles.some((item) => item.id === cli.profileId)
      ? cli
      : { ...cli, profileId: state.profiles[0].id };
  });
}

function updateBoundCliText() {
  const tool = state.boundCliTool;
  dom.boundCliText.textContent =
    `已绑定命令: ${tool.source === "none" ? "未找到（将使用系统命令）" : `${tool.source} · ${tool.path}`}`;
}

function openProfileDialog(mode, profileId) {
  state.editingProfileId = mode === "edit" ? profileId : "";
  const profile = state.profiles.find((item) => item.id === profileId);
  dom.dialogTitle.textContent = mode === "edit" ? "编辑 API" : "添加 API";
  renderPresetOptions(CUSTOM_PRESET_ID);
  dom.nameInput.value = profile ? profile.name : "";
  dom.baseUrlInput.value = profile ? profile.baseUrl : "";
  dom.apiKeyInput.value = profile ? profile.apiKey : "";
  dom.modelInput.value = profile ? profile.model : "";
  dom.apiStyleInput.value = profile ? profile.apiStyle : "openai";
  dom.profileDialog.showModal();
}

function saveProfileFromDialog() {
  const name = dom.nameInput.value.trim();
  const baseUrl = dom.baseUrlInput.value.trim();
  if (!name) return;
  if (!baseUrl) return;

  const payload = {
    name,
    baseUrl,
    apiKey: dom.apiKeyInput.value.trim(),
    model: dom.modelInput.value.trim(),
    apiStyle: dom.apiStyleInput.value,
  };
  if (state.editingProfileId) {
    state.profiles = state.profiles.map((item) =>
      item.id === state.editingProfileId ? { ...item, ...payload } : item,
    );
  } else {
    state.profiles.push({ id: createId("profile"), ...payload });
  }
  normalizeCliProfile();
  persistState();
  renderProfiles();
  renderCliList();
  dom.profileDialog.close();
}

function removeProfile(profileId) {
  state.profiles = state.profiles.filter((item) => item.id !== profileId);
  normalizeCliProfile();
  persistState();
  renderProfiles();
  renderCliList();
}

async function detectCliPath() {
  const bridge = window.clovapiCli;
  if (!bridge?.which) return;
  const next = {};
  for (const cli of state.clis) {
    try {
      const result = await bridge.which(cli.command);
      next[cli.id] = result?.exists ? result.path || "available" : "";
    } catch {
      next[cli.id] = "";
    }
  }
  state.cliDetectedPath = next;
  renderCliList();
}

async function runCliCheck(cli) {
  const bridge = window.clovapiCli;
  if (!bridge) return;
  const cwdRes = await bridge.defaultCwd().catch(() => ({ cwd: "" }));
  const env = profileEnv(cli.profileId);
  const boundPath = (state.boundCliTool.path || "").trim();
  const command = boundPath ? `"${boundPath}" --version` : `${cli.command} --version`;
  const result = await bridge.run(command, cwdRes.cwd || "", env);
  if (!result?.ok) {
    window.alert(result?.error || "CLI 启动失败");
    setRunning(false);
    return;
  }
  setRunning(true);
}

function bindEvents() {
  dom.tabCli.addEventListener("click", () => setActiveTab("cli"));
  dom.tabProfiles.addEventListener("click", () => setActiveTab("profiles"));
  dom.newProfileBtn.addEventListener("click", () => openProfileDialog("create", ""));
  dom.cancelDialogBtn.addEventListener("click", () => dom.profileDialog.close());
  dom.presetInput.addEventListener("change", () => applyPresetToDialog(dom.presetInput.value));
  dom.profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveProfileFromDialog();
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  readInitialState();
  mergeCliSlotsFromDefaults();
  await loadPresets();
  normalizeCliProfile();
  persistState();
  bindEvents();
  renderProfiles();
  renderCliList();
  setActiveTab("cli");

  const bridge = window.clovapiCli;
  if (bridge) {
    bridge.onExit(() => setRunning(false));
    const runState = await bridge.state().catch(() => ({ running: false }));
    setRunning(Boolean(runState?.running));
    const tool = await bridge.toolStatus?.().catch(() => null);
    if (tool?.available) {
      state.boundCliTool = { source: tool.source, path: tool.path || "" };
    }
    updateBoundCliText();
    await detectCliPath();
  }
});

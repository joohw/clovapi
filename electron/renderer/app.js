const commandInput = document.getElementById("commandInput");
const cwdInput = document.getElementById("cwdInput");
const runButton = document.getElementById("runButton");
const stopButton = document.getElementById("stopButton");
const clearButton = document.getElementById("clearButton");
const exampleButton = document.getElementById("exampleButton");
const output = document.getElementById("output");
const statusBadge = document.getElementById("statusBadge");

const EXAMPLE_COMMAND = "clovapi profile list";

function append(text) {
  output.textContent += text;
  output.scrollTop = output.scrollHeight;
}

function setRunning(running) {
  statusBadge.textContent = running ? "Running" : "Idle";
  statusBadge.classList.toggle("running", running);
  runButton.disabled = running;
  commandInput.disabled = running;
}

function clearOutput() {
  output.textContent = "";
}

async function runCommand() {
  const command = commandInput.value.trim();
  const cwd = cwdInput.value.trim();
  const result = await window.clovapiCli.run(command, cwd);
  if (!result.ok) {
    append(`[error] ${result.error}\n`);
    return;
  }
  setRunning(true);
}

async function stopCommand() {
  const result = await window.clovapiCli.stop();
  if (!result.ok) {
    append(`[error] ${result.error}\n`);
    return;
  }
  append("\n[system] stop signal sent\n");
}

function useExample() {
  commandInput.value = EXAMPLE_COMMAND;
}

runButton.addEventListener("click", () => void runCommand());
stopButton.addEventListener("click", () => void stopCommand());
clearButton.addEventListener("click", clearOutput);
exampleButton.addEventListener("click", useExample);

commandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void runCommand();
  }
});

window.clovapiCli.onOutput((payload) => {
  append(payload.data || "");
});

window.clovapiCli.onExit(() => {
  setRunning(false);
});

window.addEventListener("DOMContentLoaded", async () => {
  const cwdRes = await window.clovapiCli.defaultCwd();
  cwdInput.value = String(cwdRes?.cwd || "");
  const state = await window.clovapiCli.state();
  setRunning(Boolean(state.running));
  append("[system] Ready. Run a command to start.\n");
});

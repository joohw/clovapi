import { mount } from "svelte";
import App from "./App.svelte";
import { initI18n } from "./lib/i18n";
import "./app.css";

initI18n();

mount(App, { target: document.getElementById("app")! });

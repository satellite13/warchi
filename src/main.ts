import { createApp } from "vue";
import "@fontsource/outfit/300.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/material-symbols-outlined/400.css";
import "./style.css";
import "./assets/buttons.css";
import App from "./App.vue";
import router from "./router";
import i18n from "./i18n";

createApp(App).use(router).use(i18n).mount("#app");

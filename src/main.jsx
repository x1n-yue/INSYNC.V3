import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ToastProvider } from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import { installMonitoring } from "./lib/monitoring";

installMonitoring();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary><ToastProvider>
      <App />
    </ToastProvider></ErrorBoundary>
  </React.StrictMode>
);

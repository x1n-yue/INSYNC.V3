import { Component } from "react";
import { reportHealth } from "../lib/monitoring";

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { reportHealth("render-error"); }
  render() {
    if (this.state.failed) return <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <h1 className="text-lg font-semibold">INSync could not open this screen</h1>
      <p role="alert">A screen failed to load. Check your connection, then reload. Unsaved changes may need to be entered again.</p>
      <button className="rounded-lg px-4 py-2" style={{ background: "var(--primary)", color: "white" }} onClick={() => window.location.reload()}>Reload INSync</button>
    </main>;
    return this.props.children;
  }
}

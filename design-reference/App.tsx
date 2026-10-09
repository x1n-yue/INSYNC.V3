import { useState } from "react";
import LoginPage from "./components/LoginPage";
import AdminDashboard from "./components/AdminDashboard";
import InstructorDashboard from "./components/InstructorDashboard";
import InternDashboard from "./components/InternDashboard";

export type Role = "admin" | "instructor" | "intern" | null;

export default function App() {
  const [role, setRole] = useState<Role>(null);

  if (!role) return <LoginPage onLogin={setRole} />;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {role === "admin" && <AdminDashboard onLogout={() => setRole(null)} />}
      {role === "instructor" && <InstructorDashboard onLogout={() => setRole(null)} />}
      {role === "intern" && <InternDashboard onLogout={() => setRole(null)} />}
    </div>
  );
}

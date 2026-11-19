import type { ReactNode } from "react";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <main className="center">
      <div className="authbox">
        <div className="brand" style={{ marginBottom: "1rem", fontSize: "1.4rem" }}>
          TE One
          <small>Enterprise Customer Relationship Management Platform · Trilogika Edutama</small>
        </div>
        <div className="card">{children}</div>
      </div>
    </main>
  );
}

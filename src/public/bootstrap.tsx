import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../app/App";
import { ServiceWorkerRegister } from "../app/components/ServiceWorkerRegister";
import "../styles/index.css";

export function mountPublicSite(element: HTMLElement): void {
  createRoot(element).render(
    <StrictMode>
      <App />
      <ServiceWorkerRegister />
    </StrictMode>,
  );
}

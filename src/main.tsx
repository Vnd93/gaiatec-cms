import { mountPublicSite } from "./public/bootstrap";

const root = document.getElementById("root");
if (!root) throw new Error("public-root-missing");
mountPublicSite(root);

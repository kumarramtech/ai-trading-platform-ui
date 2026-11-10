/* =========================================================
   App configuration — read from the .env file at the project
   root (like application.properties in Spring Boot). Every API
   module imports from here; no address is hard-coded elsewhere.
   ========================================================= */

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

if (!API_BASE_URL) {
  console.error("VITE_API_BASE_URL is not set: add it to the .env file and restart Vite.");
}

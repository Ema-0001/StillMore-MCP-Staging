export const CONTRACT_VERSION = "stillmore.mcp.v1";
export const READ_SCOPE = "stillmore:read";
export const WRITE_SCOPE = "stillmore:write";

export class ContractError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ContractError";
    this.code = code;
    this.details = details;
  }
}

export function object(value, label = "value") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContractError("invalid_input", `${label} must be an object.`);
  return value;
}
export function text(value, label, {optional = false, max = 240} = {}) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ContractError("invalid_input", `${label} must be non-empty text up to ${max} characters.`);
  return value.trim();
}
export function identifier(value, label = "id") {
  const result = text(value, label, {max: 160});
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) throw new ContractError("invalid_input", `${label} has an invalid format.`);
  return result;
}
export function amount(value, label = "quantity", {allowZero = false} = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < (allowZero ? 0 : 0.001) || value > 1_000_000_000) throw new ContractError("invalid_input", `${label} must be a valid ${allowZero ? "non-negative" : "positive"} number.`);
  return Math.round(value * 1000) / 1000;
}
export function isoDate(value, label = "date") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ContractError("invalid_input", `${label} must use YYYY-MM-DD.`);
  const [y,m,d] = value.split("-").map(Number), parsed = new Date(Date.UTC(y,m-1,d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m-1 || parsed.getUTCDate() !== d) throw new ContractError("invalid_input", `${label} is invalid.`);
  return value;
}
export function operationId(value) {
  const result = identifier(value, "operation_id");
  if (result.length < 8) throw new ContractError("invalid_input", "operation_id must be stable and at least 8 characters.");
  return result;
}
export function language(value) { return value === "it" || value === "cs" ? value : "en"; }
export function requireScope(auth, required) {
  if (!auth?.userId) throw new ContractError("unauthorized", "Authentication required.");
  if (!auth.scopes?.includes(required)) throw new ContractError("forbidden", `Missing scope: ${required}.`);
}
export function snapshotMeta(snapshot) {
  return {contract: CONTRACT_VERSION, revision: snapshot.revision, synchronized_at: snapshot.synchronizedAt, stale: Date.now() - Date.parse(snapshot.synchronizedAt) > 15 * 60_000};
}

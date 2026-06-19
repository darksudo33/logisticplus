export function normalizePasswordLoginBody(body = {}) {
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  return {
    email,
    password,
    loginEmailKey: email.toLowerCase() || "missing",
  };
}

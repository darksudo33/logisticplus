export function manualSignupMissingField(body = {}) {
  const required = ["companyName", "ownerName", "ownerEmail", "password", "planId"];
  return required.find((field) => !body[field]) || null;
}

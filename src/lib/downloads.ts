function unquoteHeaderValue(value = "") {
  const trimmed = String(value || "").trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

export function filenameFromContentDisposition(header: string | null) {
  if (!header) return "";
  const filenameStar = header.match(/(?:^|;)\s*filename\*\s*=\s*([^;]+)/i)?.[1];
  if (filenameStar) {
    const value = unquoteHeaderValue(filenameStar).replace(/^UTF-8''/i, "");
    try {
      const decoded = decodeURIComponent(value);
      if (decoded.trim()) return decoded.trim();
    } catch {
      if (value.trim()) return value.trim();
    }
  }

  const filename = header.match(/(?:^|;)\s*filename\s*=\s*("[^"]*"|[^;]+)/i)?.[1];
  return unquoteHeaderValue(filename || "").trim();
}

function extensionFromMimeType(mimeType = "") {
  const normalized = mimeType.split(";")[0].trim().toLowerCase();
  if (normalized === "application/pdf") return ".pdf";
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  return "";
}

function safeFallbackFilename(fileName = "document", mimeType = "") {
  const cleaned = String(fileName || "document")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[\\/]+/g, " ")
    .replace(/[<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "document";
  const hasExtension = /\.[A-Za-z0-9]{1,16}$/.test(cleaned);
  if (hasExtension) return cleaned;
  return `${cleaned}${extensionFromMimeType(mimeType)}`;
}

async function parseDownloadError(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      return payload?.error?.message || payload?.message || response.statusText || "Download failed.";
    }
    const text = await response.text();
    return text.slice(0, 240) || response.statusText || "Download failed.";
  } catch {
    return response.statusText || "Download failed.";
  }
}

export async function downloadBinaryFile(url: string, fallbackName = "document") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await parseDownloadError(response));
  }

  const blob = await response.blob();
  const filename =
    filenameFromContentDisposition(response.headers.get("content-disposition")) ||
    safeFallbackFilename(fallbackName, response.headers.get("content-type") || blob.type);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return filename;
}

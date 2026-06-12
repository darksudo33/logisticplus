import fs from "node:fs/promises";
import path from "node:path";

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index] || 0;
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function isSuccessStatus(status) {
  const code = Number(status);
  return code >= 200 && code < 400;
}

export function summarizeLoadResult(result) {
  const samples = Array.isArray(result?.samples) ? result.samples : [];
  const latencies = samples.map((sample) => Number(sample.ms)).filter(Number.isFinite);
  const startedAt = result?.startedAt ? new Date(result.startedAt).getTime() : Date.now();
  const endedAt = result?.endedAt ? new Date(result.endedAt).getTime() : Date.now();
  const durationSeconds = Math.max(0.001, (endedAt - startedAt) / 1000);
  const totalRequests = samples.length;
  const nonSuccess = samples.filter((sample) => !isSuccessStatus(sample.status)).length;
  const timeoutCount = samples.filter((sample) => sample.timeout).length;
  const networkErrorCount = samples.filter((sample) => sample.status === "NETWORK").length;
  const errorCount = nonSuccess + networkErrorCount;
  const errorRate = totalRequests ? errorCount / totalRequests : 0;
  const avgLatencyMs = latencies.length
    ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
    : 0;
  const p50Ms = percentile(latencies, 50);
  const p95Ms = percentile(latencies, 95);
  const p99Ms = percentile(latencies, 99);
  const maxErrorRate = Number(result?.config?.maxErrorRate ?? 0.01);
  const maxP95Ms = Number(result?.config?.maxP95Ms ?? 1500);
  const thresholds = {
    errorRate: errorRate <= maxErrorRate,
    p95: p95Ms <= maxP95Ms,
  };
  const passed = thresholds.errorRate && thresholds.p95;
  const concurrentUsers = Number(result?.config?.concurrency || result?.config?.vus || 0);
  const activityRatio = Number(result?.config?.activityRatio || 0.05);
  const estimatedCustomerAccounts =
    passed && concurrentUsers > 0 && activityRatio > 0
      ? Math.floor(concurrentUsers / activityRatio)
      : 0;

  return {
    totalRequests,
    requestsPerSecond: round(totalRequests / durationSeconds),
    avgLatencyMs: round(avgLatencyMs),
    p50Ms: round(p50Ms),
    p95Ms: round(p95Ms),
    p99Ms: round(p99Ms),
    non2xx3xxCount: nonSuccess,
    timeoutCount,
    networkErrorCount,
    errorRate: round(errorRate, 4),
    thresholds,
    passed,
    interpretation: {
      concurrentActiveUsers: concurrentUsers,
      assumedActivityRatio: activityRatio,
      estimatedCustomerAccounts,
      note: "This is a launch-planning estimate, not a guarantee.",
    },
  };
}

export function printSummary(summary) {
  console.log("Load result summary");
  console.log(`- total requests: ${summary.totalRequests}`);
  console.log(`- requests/sec: ${summary.requestsPerSecond}`);
  console.log(`- avg latency: ${summary.avgLatencyMs}ms`);
  console.log(`- p50/p95/p99: ${summary.p50Ms}ms / ${summary.p95Ms}ms / ${summary.p99Ms}ms`);
  console.log(`- non-2xx/3xx: ${summary.non2xx3xxCount}`);
  console.log(`- timeouts: ${summary.timeoutCount}`);
  console.log(`- network errors: ${summary.networkErrorCount}`);
  console.log(`- error rate: ${summary.errorRate}`);
  console.log(`- thresholds: errorRate=${summary.thresholds.errorRate ? "pass" : "fail"}, p95=${summary.thresholds.p95 ? "pass" : "fail"}`);
  console.log(`- overall: ${summary.passed ? "PASS" : "FAIL"}`);
  if (summary.interpretation.estimatedCustomerAccounts) {
    console.log(
      `- rough capacity estimate: ${summary.interpretation.concurrentActiveUsers} stable active users / ${summary.interpretation.assumedActivityRatio} activity ratio ~= ${summary.interpretation.estimatedCustomerAccounts} customer accounts`
    );
  }
  console.log(`- note: ${summary.interpretation.note}`);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function latestResultFile() {
  const directory = path.resolve("test-results", "load");
  const entries = await fs.readdir(directory).catch(() => []);
  const files = entries
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.join(directory, entry));
  if (!files.length) return null;
  const stats = await Promise.all(files.map(async (file) => ({ file, stat: await fs.stat(file) })));
  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return stats[0].file;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  const filePath = process.argv[2] || await latestResultFile();
  if (!filePath) {
    console.error("No load result JSON file found. Pass a file path or run the load script first.");
    process.exit(1);
  }
  const result = await readJson(filePath);
  const summary = summarizeLoadResult(result);
  printSummary(summary);
  process.exit(summary.passed ? 0 : 1);
}

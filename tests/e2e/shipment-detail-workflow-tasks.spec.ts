import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  USER_PASSWORD,
  disposeContexts,
  loginApi,
  loginViaUi,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
type DbClient = InstanceType<typeof Client>;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const shipmentId = "s1";
let client: DbClient;

async function cleanupShipmentWorkflow(client: DbClient) {
  await client.query("DELETE FROM task_events WHERE shipment_id = $1", [shipmentId]);
  await client.query(
    `DELETE FROM tasks
     WHERE shipment_id = $1
       AND (
         title LIKE 'E2E shipment detail workflow%'
         OR workflow_instance_id IS NOT NULL
         OR workflow_step_code IS NOT NULL
         OR workflow_blocker_id IS NOT NULL
         OR blocker_code IS NOT NULL
       )`,
    [shipmentId]
  );
  await client.query("DELETE FROM shipment_workflow_instances WHERE shipment_id = $1", [shipmentId]);
  await client.query("DELETE FROM chat_threads WHERE shipment_id = $1", [shipmentId]);
  await client.query("DELETE FROM shipment_status_events WHERE shipment_id = $1 AND public_label LIKE 'E2E shipment detail public%'", [shipmentId]);
  await client.query(
    `UPDATE shipments
     SET customer_access_enabled = FALSE,
         customer_access_token = NULL,
         customer_access_token_hash = NULL
     WHERE id = $1`,
    [shipmentId]
  );
}

async function createOperationsUser(owner: Awaited<ReturnType<typeof loginApi>>) {
  const email = uniqueEmail("e2e-shipment-detail-ops");
  const user = await readOk<any>(
    await owner.post("/api/users", {
      data: {
        name: "E2E Shipment Detail Operations",
        email,
        password: USER_PASSWORD,
        role: "OPERATIONS",
      },
    })
  );
  return { id: user.id, email };
}

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const email = uniqueEmail("e2e-shipment-detail-tenant");
  await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `E2E Workflow Tenant ${Date.now()}`,
        ownerName: "E2E Workflow Tenant Owner",
        ownerEmail: email,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  const result = await client.query("SELECT id FROM app_users WHERE lower(email) = lower($1) LIMIT 1", [email]);
  return { id: result.rows[0].id, email };
}

async function clearWorkflowStorage(page: any) {
  await page.evaluate(() => {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("logisticplus.workflow."))
      .forEach((key) => window.localStorage.removeItem(key));
  });
}

async function saveLegacyBootstrapRecords(owner: Awaited<ReturnType<typeof loginApi>>) {
  const bootstrapResponse = await owner.get("/api/users/u1/bootstrap");
  expect(bootstrapResponse.status(), await bootstrapResponse.text()).toBeLessThan(400);
  const bootstrapPayload = await bootstrapResponse.json();
  const saveResponse = await owner.put("/api/users/u1/records", {
    data: { records: bootstrapPayload.records || {} },
  });
  expect(saveResponse.status(), await saveResponse.text()).toBeLessThan(400);
}

async function insertShipmentChatHistory({
  organizationId,
  threadId,
  senderId,
  senderName,
  prefix,
  count,
}: {
  organizationId: string;
  threadId: string;
  senderId: string;
  senderName: string;
  prefix: string;
  count: number;
}) {
  for (let index = 0; index < count; index += 1) {
    await client.query(
      `INSERT INTO chat_messages (
         id, organization_id, thread_id, sender_id, sender_name, content, body, body_format,
         client_message_id, status, legacy_data, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $6, 'plain_text', $7, 'sent', '{}'::jsonb, NOW() - ($8::int * INTERVAL '1 minute'))`,
      [
        `e2e-shipment-chat-history-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        organizationId,
        threadId,
        senderId,
        senderName,
        `${prefix} ${index} ${"history ".repeat(10)}`,
        `${prefix}-${index}`,
        count + 60 - index,
      ]
    );
  }
}

test.describe.serial("shipment detail workflow and task controls", () => {
  test.beforeAll(async () => {
    client = new Client({ connectionString: testDatabaseUrl });
    await client.connect();
  });

  test.beforeEach(async () => {
    await cleanupShipmentWorkflow(client);
  });

  test.afterAll(async () => {
    await cleanupShipmentWorkflow(client);
    await client.end();
  });

  test("workflow completion activates the next visible step and assigned employees can start and finish tasks", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const empty = await readOk<any>(await owner.get(`/api/shipments/${shipmentId}/progress`));
      expect(empty.workflow).toBeNull();

      const started = await readOk<any>(await owner.post(`/api/shipments/${shipmentId}/progress/start`));
      expect(started.workflow.currentStepCode).toBe("001");
      expect(started.steps.find((step: any) => step.code === "001")?.status).toBe("active");

      const completed = await readOk<any>(
        await owner.patch(`/api/shipments/${shipmentId}/progress/current`, {
          data: {
            stepCode: "001",
            status: "completed",
            internalNote: "E2E completes first import workflow step.",
          },
        })
      );
      expect(completed.workflow.currentStepCode).toBe("002");
      expect(completed.steps.find((step: any) => step.code === "001")?.status).toBe("completed");
      expect(completed.steps.find((step: any) => step.code === "002")?.status).toBe("active");

      const assignee = await createOperationsUser(owner);
      const task = await readOk<any>(
        await owner.post("/api/tasks", {
          data: {
            title: `E2E shipment detail workflow task ${Date.now()}`,
            description: "Assigned from shipment workflow for status-button regression coverage.",
            status: "assigned",
            priority: "HIGH",
            shipmentId,
            workflowInstanceId: completed.workflow.id,
            workflowStepCode: "002",
            assignedToUserId: assignee.id,
          },
        })
      );
      expect(task.assignedToUserId || task.assigned_to_id).toBe(assignee.id);
      expect(task.ownerUserId || task.owner_user_id).toBe("u1");
      expect(task.organizationId || task.organization_id).toBeTruthy();

      const operations = await loginApi(assignee.email, USER_PASSWORD);
      contexts.push(operations);
      const visibleToAssignee = await readOk<any>(await operations.get(`/api/tasks/${task.id}`));
      expect(visibleToAssignee.assignedToUserId || visibleToAssignee.assigned_to_id).toBe(assignee.id);

      const inProgress = await readOk<any>(
        await operations.patch(`/api/tasks/${task.id}/status`, {
          data: { status: "in_progress", note: "E2E start from assigned employee." },
        })
      );
      expect(inProgress.status).toBe("IN_PROGRESS");

      const done = await readOk<any>(
        await operations.patch(`/api/tasks/${task.id}/status`, {
          data: { status: "done", note: "E2E finish from assigned employee." },
        })
      );
      expect(done.status).toBe("DONE");
      expect(done.completedByUserId || done.completed_by_user_id).toBe(assignee.id);

      const events = await readOk<any[]>(await operations.get(`/api/tasks/${task.id}/events`));
      expect(events.some((event) => event.toStatus === "IN_PROGRESS")).toBe(true);
      expect(events.some((event) => event.toStatus === "DONE")).toBe(true);
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test("workflow mutations auto-start a missing workflow instead of returning not started", async () => {
    const owner = await loginApi();
    try {
      const completed = await readOk<any>(
        await owner.patch(`/api/shipments/${shipmentId}/progress/current`, {
          data: {
            stepCode: "001",
            status: "completed",
            internalNote: "E2E auto-starts workflow from a direct completion action.",
          },
        })
      );
      expect(completed.workflow.currentStepCode).toBe("002");
      expect(completed.steps.find((step: any) => step.code === "001")?.status).toBe("completed");
      expect(completed.steps.find((step: any) => step.code === "002")?.status).toBe("active");
      expect(completed.history.some((event: any) => event.eventType === "workflow.started")).toBe(true);
      expect(completed.history.some((event: any) => event.eventType === "workflow.step.completed")).toBe(true);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("adding a blocker auto-starts a missing workflow", async () => {
    const owner = await loginApi();
    try {
      const data = await readOk<any>(
        await owner.post(`/api/shipments/${shipmentId}/progress/blockers`, {
          data: {
            stepCode: "001",
            blockerCode: "B01",
            internalNote: "E2E missing document blocker.",
          },
        })
      );
      expect(data.progress.workflow.currentStepCode).toBe("001");
      expect(data.blocker.blockerCode).toBe("B01");
      expect(data.progress.blockers.some((blocker: any) => blocker.blockerCode === "B01" && blocker.status === "open")).toBe(true);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("legacy records refresh preserves workflow progress, blockers, and task history", async () => {
    const owner = await loginApi();
    try {
      await readOk<any>(await owner.post(`/api/shipments/${shipmentId}/progress/start`));
      const completed = await readOk<any>(
        await owner.patch(`/api/shipments/${shipmentId}/progress/current`, {
          data: {
            stepCode: "001",
            status: "completed",
            internalNote: "E2E verifies workflow survives legacy bootstrap save.",
          },
        })
      );
      const blockerData = await readOk<any>(
        await owner.post(`/api/shipments/${shipmentId}/progress/blockers`, {
          data: {
            stepCode: "002",
            blockerCode: "B01",
            internalNote: "E2E blocker should survive legacy save.",
          },
        })
      );
      const task = await readOk<any>(
        await owner.post("/api/tasks", {
          data: {
            title: `E2E shipment detail workflow persistence task ${Date.now()}`,
            description: "Workflow task and event history should survive legacy save.",
            status: "assigned",
            priority: "HIGH",
            shipmentId,
            workflowInstanceId: completed.workflow.id,
            workflowStepCode: "002",
            workflowBlockerId: blockerData.blocker.id,
            blockerCode: "B01",
            assignedToUserId: "u1",
          },
        })
      );
      const eventsBefore = await readOk<any[]>(await owner.get(`/api/tasks/${task.id}/events`));
      expect(eventsBefore.some((event) => event.eventType === "task.created")).toBe(true);

      await saveLegacyBootstrapRecords(owner);

      const progressAfter = await readOk<any>(await owner.get(`/api/shipments/${shipmentId}/progress`));
      expect(progressAfter.workflow.id).toBe(completed.workflow.id);
      expect(progressAfter.workflow.currentStepCode).toBe("002");
      expect(progressAfter.steps.find((step: any) => step.code === "001")?.status).toBe("completed");
      expect(progressAfter.steps.find((step: any) => step.code === "002")?.status).toBe("active");
      expect(progressAfter.blockers.some((blocker: any) => blocker.id === blockerData.blocker.id && blocker.status === "open")).toBe(true);

      const taskAfter = await readOk<any>(await owner.get(`/api/tasks/${task.id}`));
      expect(taskAfter.workflowInstanceId || taskAfter.workflow_instance_id).toBe(completed.workflow.id);
      expect(taskAfter.workflowBlockerId || taskAfter.workflow_blocker_id).toBe(blockerData.blocker.id);
      const eventsAfter = await readOk<any[]>(await owner.get(`/api/tasks/${task.id}/events`));
      expect(eventsAfter.some((event) => event.eventType === "task.created")).toBe(true);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("workflow sections collapse, expand, and persist per shipment", async ({ page }) => {
    await loginViaUi(page);
    await clearWorkflowStorage(page);
    await page.goto(`/shipments/${shipmentId}`);
    await page.getByTestId("workflow-start").click();

    await expect(page.getByTestId("workflow-phase-body-order_registration")).toBeVisible();
    await expect(page.getByTestId("workflow-phase-body-fx_bank")).toHaveCount(0);

    await page.getByTestId("workflow-phase-toggle-order_registration").click();
    await expect(page.getByTestId("workflow-phase-body-order_registration")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("workflow-phase-body-order_registration")).toHaveCount(0);

    await page.getByTestId("workflow-active-phase").click();
    await expect(page.getByTestId("workflow-phase-body-order_registration")).toBeVisible();

    await page.getByTestId("workflow-expand-all").click();
    await expect(page.getByTestId("workflow-phase-body-fx_bank")).toBeVisible();

    await page.getByTestId("workflow-collapse-all").click();
    await expect(page.getByTestId("workflow-phase-body-order_registration")).toHaveCount(0);
    await expect(page.getByTestId("workflow-phase-body-fx_bank")).toHaveCount(0);
  });

  test("workflow task assignment works from step and blocker dialogs", async ({ page }) => {
    const owner = await loginApi();
    let assignee: { id: string; email: string };
    let blocker: any;
    try {
      assignee = await createOperationsUser(owner);
      const started = await readOk<any>(await owner.post(`/api/shipments/${shipmentId}/progress/start`));
      const blockerData = await readOk<any>(
        await owner.post(`/api/shipments/${shipmentId}/progress/blockers`, {
          data: {
            stepCode: "001",
            blockerCode: "B01",
            internalNote: "E2E assignment blocker.",
          },
        })
      );
      expect(started.workflow.id).toBeTruthy();
      blocker = blockerData.blocker;
    } finally {
      await disposeContexts(owner);
    }

    await loginViaUi(page);
    await clearWorkflowStorage(page);
    await page.goto(`/shipments/${shipmentId}`);
    await expect(page.getByTestId("workflow-phase-body-order_registration")).toBeVisible();

    await page.getByTestId("workflow-step-assign-001").click();
    await expect(page.getByTestId("task-assign-assignee")).toBeEnabled();
    await page.getByTestId("task-assign-assignee").selectOption(assignee!.id);
    const assignmentDialog = page.getByRole("dialog");
    await assignmentDialog.getByTestId("shamsi-date-time-trigger").click();
    await expect(page.getByTestId("shamsi-date-time-panel")).toBeVisible();
    await page.getByTestId("shamsi-date-day").first().click();
    await page.getByTestId("shamsi-time-hour-select").selectOption("14");
    await page.getByTestId("shamsi-time-minute-select").selectOption("30");
    await expect(page.getByTestId("task-assign-due-date")).toHaveValue(/14:30/);
    await page.getByTestId("task-assign-note").fill("E2E step task assignment.");
    await page.getByTestId("task-assign-submit").click();

    await expect.poll(async () => {
      return page.evaluate(async (id) => {
        const response = await fetch(`/api/tasks?shipmentId=${encodeURIComponent(id)}`);
        const payload = await response.json();
        return (payload.data || []).find((task: any) => task.workflowStepCode === "001" && task.assignedToUserId && String(task.dueDate || "").includes("14:30"));
      }, shipmentId);
    }).toBeTruthy();

    await page.getByTestId(`workflow-blocker-assign-${blocker.id}`).click();
    await expect(page.getByTestId("task-assign-assignee")).toBeEnabled();
    await page.getByTestId("task-assign-assignee").selectOption(assignee!.id);
    await page.getByTestId("task-assign-note").fill("E2E blocker task assignment.");
    await page.getByTestId("task-assign-submit").click();

    await expect.poll(async () => {
      return page.evaluate(async ({ id, blockerId }) => {
        const response = await fetch(`/api/tasks?shipmentId=${encodeURIComponent(id)}`);
        const payload = await response.json();
        return (payload.data || []).some((task: any) => task.workflowBlockerId === blockerId && task.status === "ASSIGNED");
      }, { id: shipmentId, blockerId: blocker.id });
    }).toBe(true);

    const taskId = await page.evaluate(async (id) => {
      const response = await fetch(`/api/tasks?shipmentId=${encodeURIComponent(id)}`);
      const payload = await response.json();
      return (payload.data || []).find((task: any) => task.workflowStepCode === "001")?.id || null;
    }, shipmentId);
    await expect(page.getByTestId(`related-shipment-task-${taskId}`)).toBeVisible();
  });

  test("workflow task permissions allow company assignment but block other-organization assignees", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const assignee = await createOperationsUser(owner);
      const teammate = await createOperationsUser(owner);
      const tenantOwner = await createTenantOwner(owner);
      const started = await readOk<any>(await owner.post(`/api/shipments/${shipmentId}/progress/start`));

      const operations = await loginApi(assignee.email, USER_PASSWORD);
      contexts.push(operations);

      const members = await readOk<any[]>(await operations.get("/api/organization/members"));
      expect(members.map((member) => member.userId)).toEqual(expect.arrayContaining([assignee.id, teammate.id]));

      const selfTask = await readOk<any>(
        await operations.post("/api/tasks", {
          data: {
            title: `E2E shipment detail workflow self task ${Date.now()}`,
            status: "assigned",
            priority: "HIGH",
            shipmentId,
            workflowInstanceId: started.workflow.id,
            workflowStepCode: "001",
            assignedToUserId: assignee.id,
          },
        })
      );
      expect(selfTask.assignedToUserId || selfTask.assigned_to_id).toBe(assignee.id);

      const sameOrgOtherAssignee = await readOk<any>(
        await operations.post("/api/tasks", {
          data: {
            title: `E2E shipment detail workflow teammate task ${Date.now()}`,
            shipmentId,
            workflowInstanceId: started.workflow.id,
            workflowStepCode: "001",
            assignedToUserId: teammate.id,
          },
        })
      );
      expect(sameOrgOtherAssignee.assignedToUserId || sameOrgOtherAssignee.assigned_to_id).toBe(teammate.id);

      const crossOrgAssignee = await owner.post("/api/tasks", {
        data: {
          title: `E2E shipment detail workflow cross org task ${Date.now()}`,
          shipmentId,
          workflowInstanceId: started.workflow.id,
          workflowStepCode: "001",
          assignedToUserId: tenantOwner.id,
        },
      });
      expect(crossOrgAssignee.status(), await crossOrgAssignee.text()).toBe(404);
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test("shipment detail workflow buttons call progress APIs without server errors", async ({ page }) => {
    const serverErrors: string[] = [];
    page.on("response", (response) => {
      const url = response.url();
      if ((url.includes("/api/shipments/") || url.includes("/api/tasks")) && response.status() >= 500) {
        serverErrors.push(`${response.status()} ${url}`);
      }
    });

    await loginViaUi(page);
    await page.goto(`/shipments/${shipmentId}`);
    await page.getByRole("button", { name: /شروع گردش کار/ }).click();
    await expect.poll(async () => {
      return page.evaluate(async (id) => {
        const response = await fetch(`/api/shipments/${id}/progress`);
        const payload = await response.json();
        return payload.data?.workflow?.currentStepCode || null;
      }, shipmentId);
    }).toBe("001");

    await page.getByRole("button", { name: /^تکمیل$/ }).first().click();
    await expect(page.getByRole("dialog")).toContainText("تکمیل مرحله");
    await page.getByRole("button", { name: "ذخیره" }).click();

    await expect.poll(async () => {
      return page.evaluate(async (id) => {
        const response = await fetch(`/api/shipments/${id}/progress`);
        const payload = await response.json();
        const step001 = payload.data?.steps?.find((step: any) => step.code === "001");
        const step002 = payload.data?.steps?.find((step: any) => step.code === "002");
        return {
          current: payload.data?.workflow?.currentStepCode,
          first: step001?.status,
          second: step002?.status,
        };
      }, shipmentId);
    }).toEqual({ current: "002", first: "completed", second: "active" });

    expect(serverErrors).toEqual([]);
  });

  test("shipment detail opens the canonical shipment chat and links to full chat", async ({ page }) => {
    const owner = await loginApi();
    const ownerAuth = await readOk<any>(await owner.get("/api/auth/me"));
    const thread = await readOk<{ id: string }>(await owner.get(`/api/shipments/${shipmentId}/chat-thread`));
    await insertShipmentChatHistory({
      organizationId: ownerAuth.user.organizationId,
      threadId: thread.id,
      senderId: ownerAuth.user.id,
      senderName: ownerAuth.user.name || ownerAuth.user.email,
      prefix: "shipment compact message",
      count: 45,
    });
    await disposeContexts(owner);

    const messageRequestUrls: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`)) {
        messageRequestUrls.push(url);
      }
    });

    await loginViaUi(page);
    await page.goto(`/shipments/${shipmentId}`);

    await expect(page.getByTestId("shipment-chat-panel")).toBeVisible();
    await expect(page.getByTestId("shipment-documents-panel")).toBeVisible();
    const panelOrder = await page.evaluate(() => {
      const chat = document.querySelector('[data-testid="shipment-chat-panel"]') as HTMLElement;
      const documents = document.querySelector('[data-testid="shipment-documents-panel"]') as HTMLElement;
      return {
        chatTop: chat.getBoundingClientRect().top,
        documentsTop: documents.getBoundingClientRect().top,
      };
    });
    expect(panelOrder.chatTop).toBeLessThan(panelOrder.documentsTop);
    await expect(page.getByTestId("shipment-chat-message-bubble")).toHaveCount(20);
    await expect(page.getByTestId("shipment-chat-message-bubble").filter({ hasText: "shipment compact message 44" })).toBeVisible();
    await expect(page.getByTestId("shipment-chat-message-bubble").filter({ hasText: "shipment compact message 0" })).toHaveCount(0);

    const beforeHistory = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="shipment-chat-message-list"]') as HTMLElement;
      const previousHeight = list.scrollHeight;
      list.scrollTop = 0;
      list.dispatchEvent(new Event("scroll"));
      return { previousHeight };
    });
    await expect(page.getByTestId("shipment-chat-message-bubble")).toHaveCount(40);
    await expect(page.getByTestId("shipment-chat-message-bubble").filter({ hasText: "shipment compact message 24" })).toBeVisible();
    const afterHistory = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="shipment-chat-message-list"]') as HTMLElement;
      return { scrollHeight: list.scrollHeight, scrollTop: list.scrollTop };
    });
    expect(afterHistory.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(afterHistory.scrollTop - (afterHistory.scrollHeight - beforeHistory.previousHeight))).toBeLessThanOrEqual(24);

    const initialRequest = messageRequestUrls.find((url) => !new URL(url).searchParams.has("before"));
    const historyRequest = messageRequestUrls.find((url) => new URL(url).searchParams.has("before"));
    expect(initialRequest).toBeTruthy();
    expect(historyRequest).toBeTruthy();
    expect(new URL(initialRequest as string).searchParams.get("limit")).toBe("20");
    expect(new URL(historyRequest as string).searchParams.get("limit")).toBe("20");
    await expect(page.getByText("گفتگوی محموله")).toBeVisible();

    const body = `shipment detail chat ${Date.now()}`;
    await page.getByTestId("shipment-chat-message-input").fill(body);
    await page.getByTestId("shipment-chat-send-button").click();
    await expect(page.getByTestId("shipment-chat-message-bubble").filter({ hasText: body })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const list = document.querySelector('[data-testid="shipment-chat-message-list"]') as HTMLElement;
      return Math.round(list.scrollHeight - list.scrollTop - list.clientHeight);
    })).toBeLessThanOrEqual(8);

    const threadRow = await client.query(
      `SELECT id
       FROM chat_threads
       WHERE shipment_id = $1
         AND type = 'SHIPMENT'
         AND archived_at IS NULL`,
      [shipmentId]
    );
    expect(threadRow.rows).toHaveLength(1);
    const threadId = threadRow.rows[0].id;
    const messages = await client.query(
      "SELECT body FROM chat_messages WHERE thread_id = $1 AND status = 'sent'",
      [threadId]
    );
    expect(messages.rows.map((row) => row.body)).toContain(body);

    await page.getByTestId("shipment-chat-full-link").click();
    await expect(page).toHaveURL(new RegExp(`/chat\\?threadId=${threadId}$`));
  });

  test("shipment detail task status and customer access buttons work from the UI", async ({ page }) => {
    const owner = await loginApi();
    let task: any = null;
    try {
      task = await readOk<any>(
        await owner.post("/api/tasks", {
          data: {
            title: `E2E shipment detail workflow related task ${Date.now()}`,
            description: "Created for shipment detail related-task button coverage.",
            status: "assigned",
            priority: "HIGH",
            shipmentId,
            assignedToUserId: "u1",
          },
        })
      );
    } finally {
      await disposeContexts(owner);
    }

    const serverErrors: string[] = [];
    page.on("response", (response) => {
      const url = response.url();
      if ((url.includes("/api/shipments/") || url.includes("/api/tasks")) && response.status() >= 500) {
        serverErrors.push(`${response.status()} ${url}`);
      }
    });

    await loginViaUi(page);
    await page.goto(`/shipments/${shipmentId}`);

    await expect(page.getByTestId(`related-shipment-task-${task.id}`)).toBeVisible();
    await page.getByTestId(`related-task-start-${task.id}`).click();
    await expect.poll(async () => {
      return page.evaluate(async (taskId) => {
        const response = await fetch(`/api/tasks/${taskId}`);
        const payload = await response.json();
        return payload.data?.status || null;
      }, task.id);
    }).toBe("IN_PROGRESS");

    await page.getByTestId(`related-task-done-${task.id}`).click();
    await expect.poll(async () => {
      return page.evaluate(async (taskId) => {
        const response = await fetch(`/api/tasks/${taskId}`);
        const payload = await response.json();
        return {
          status: payload.data?.status || null,
          completedBy: payload.data?.completedByUserId || payload.data?.completed_by_user_id || null,
        };
      }, task.id);
    }).toEqual({ status: "DONE", completedBy: "u1" });

    await expect(page.getByTestId("customer-access-generate")).toBeEnabled();
    await page.getByTestId("customer-access-generate").click();
    await expect.poll(async () => {
      return page.evaluate(async (id) => {
        const response = await fetch(`/api/shipments/${id}/customer-access`);
        const payload = await response.json();
        return {
          enabled: Boolean(payload.data?.enabled),
          hasToken: Boolean(payload.data?.hasToken),
        };
      }, shipmentId);
    }).toEqual({ enabled: true, hasToken: true });
    const generatedLink = await page.getByTestId("customer-access-link").inputValue();
    expect(generatedLink).toContain("/track/");

    const publicLabel = `E2E shipment detail public ${Date.now()}`;
    await page.getByTestId("public-status-label").fill(publicLabel);
    await page.getByTestId("public-status-description").fill("Customer-safe status update from shipment detail QA.");
    await page.getByTestId("public-status-save").click();
    await expect.poll(async () => {
      return page.evaluate(async (id) => {
        const response = await fetch(`/api/shipments/${id}/customer-access`);
        const payload = await response.json();
        return payload.data?.publicStatus?.label || null;
      }, shipmentId);
    }).toBe(publicLabel);

    await expect(page.getByTestId("customer-access-reset")).toBeEnabled();
    await page.getByTestId("customer-access-reset").click();
    await expect.poll(async () => page.getByTestId("customer-access-link").inputValue()).not.toBe(generatedLink);

    await expect(page.getByTestId("customer-access-disable")).toBeEnabled();
    await page.getByTestId("customer-access-disable").click();
    await expect.poll(async () => {
      return page.evaluate(async (id) => {
        const response = await fetch(`/api/shipments/${id}/customer-access`);
        const payload = await response.json();
        return Boolean(payload.data?.enabled);
      }, shipmentId);
    }).toBe(false);

    expect(serverErrors).toEqual([]);
  });
});

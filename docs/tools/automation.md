# Automation Tools

Stackby automations let you build event-driven or scheduled workflows that react to changes in your data. The MCP server exposes eight tools for managing automations: two high-level helpers for building full workflows in a single call, three step-by-step helpers for adding triggers and actions to existing automations, and three advanced passthrough tools for low-level backend operations.

**Related pages:** [Tool Catalog Overview](./README.md) · [Read Operations](./read-operations.md) · [API Reference](../api-reference.md)

---

## Table of Contents

1. [Tool Summary](#tool-summary)
2. [create_automation](#create_automation)
3. [update_automation](#update_automation)
4. [delete_automation](#delete_automation)
5. [add_automation_trigger](#add_automation_trigger)
6. [add_automation_action](#add_automation_action)
7. [automation_workflow_action](#automation_workflow_action) *(passthrough)*
8. [automation_trigger_action](#automation_trigger_action) *(passthrough)*
9. [automation_action_action](#automation_action_action) *(passthrough)*
10. [Trigger Type Codes](#trigger-type-codes)
11. [Action Type Codes](#action-type-codes)
12. [Recommended Workflow Patterns](#recommended-workflow-patterns)

---

## Tool Summary

| Tool | API call | Purpose |
|------|----------|---------|
| `create_automation` | `POST /api/v1/mcp/stacks/:stackId/automations` | Create an automation with trigger and optional actions in one request |
| `update_automation` | `PATCH /api/v1/mcp/stacks/:stackId/automations/:automationId` | Update automation metadata |
| `delete_automation` | `DELETE /api/v1/mcp/stacks/:stackId/automations/:automationId` | Delete an automation |
| `add_automation_trigger` | `POST /api/v1/mcp/stacks/:stackId/automation-triggers/create` | Add a trigger to an existing automation |
| `add_automation_action` | `POST /api/v1/mcp/stacks/:stackId/automation-actions/create` | Add an action step to an existing automation |
| `automation_workflow_action` | `POST /api/v1/mcp/stacks/:stackId/automation-workflows/:action` | Advanced passthrough for workflow-level operations |
| `automation_trigger_action` | `POST /api/v1/mcp/stacks/:stackId/automation-triggers/:action` | Advanced passthrough for trigger-level operations |
| `automation_action_action` | `POST /api/v1/mcp/stacks/:stackId/automation-actions/:action` | Advanced passthrough for action-step operations |

Use `list_automations` and `get_automation` (documented in [Read Operations](./read-operations.md)) to retrieve existing automations before updating or deleting them. Use `list_automation_capabilities` to browse trigger and action type codes with parameter examples before building a new automation.

---

## create_automation

Creates a complete automation workflow in a single request. This is the recommended tool for most automation use cases because it creates the workflow record, its first trigger, and any initial action steps all in one API call.

**API:** `POST /api/v1/mcp/stacks/:stackId/automations`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stackId` | string | Yes | Stack ID (from `list_stacks`) |
| `name` | string | Yes | Human-readable automation name |
| `trigger` | object | Yes | Trigger definition — see [trigger object fields](#trigger-object) below |
| `description` | string | No | Automation description |
| `isTurnedOn` | boolean | No | Whether the automation is active on creation (default: false) |
| `tableId` | string | No | Primary table associated with the automation |
| `viewId` | string | No | Primary view associated with the automation |
| `actions` | array of action objects | No | Initial action steps — see [action object fields](#actions-array-object) below |

#### Trigger object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `triggerType` | string | Yes | Trigger type code (e.g. `T_CR_ROW`) — see [Trigger Type Codes](#trigger-type-codes) |
| `triggerParams` | object | No | Trigger-specific configuration — shape varies by `triggerType` |
| `tableId` | string | No | Table that fires the trigger |
| `description` | string | No | Trigger description |

#### Actions array object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actionType` | string | Yes | Action type code (e.g. `CR_ROW`) — see [Action Type Codes](#action-type-codes) |
| `actionParams` | object | No | Action-specific configuration — shape varies by `actionType` |
| `sequence` | number | No | Execution order (positive integer) |
| `description` | string | No | Action description |

### Response

On success, returns the raw API response as pretty-printed JSON. The response includes the created automation's `id`, `name`, and the created trigger and action records.

### Error behavior

If `stackId`, `name`, or `trigger.triggerType` is missing or empty, the tool returns an error before calling the API:

```
stackId, name, and trigger.triggerType are required.
```

Any Stackby API error is surfaced unchanged with `isError: true`.

### Example — create a Row Created automation with a Send Email action

```json
{
  "stackId": "st_abc123",
  "name": "New lead notification",
  "isTurnedOn": true,
  "trigger": {
    "triggerType": "T_CR_ROW",
    "tableId": "tb_leads456",
    "description": "Fires when a new lead row is added"
  },
  "actions": [
    {
      "actionType": "S_EMAIL",
      "sequence": 1,
      "description": "Notify sales team",
      "actionParams": {
        "toWithColumnId": "sales@example.com",
        "subjectWithColumnId": "New lead: {{Name}}",
        "messageWithColumnId": "A new lead was created: {{Name}} ({{Company}})"
      }
    }
  ]
}
```

---

## update_automation

Updates metadata on an existing automation. Use this to rename an automation, toggle it on/off, or change the associated table or view without touching its triggers or action steps.

**API:** `PATCH /api/v1/mcp/stacks/:stackId/automations/:automationId`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stackId` | string | Yes | Stack ID |
| `automationId` | string | Yes | Automation ID (from `list_automations` or `create_automation`) |
| `body` | object | Yes | Patch payload — one or more patchable fields |

#### Patchable fields in `body`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | New automation name |
| `description` | string | New automation description |
| `isTurnedOn` | boolean | Enable (`true`) or disable (`false`) the automation |
| `tableId` | string | Replace the primary table association |
| `viewId` | string | Replace the primary view association |

### Response

Returns the updated automation object as pretty-printed JSON.

### Error behavior

If `stackId`, `automationId`, or `body` is missing, the tool returns an error with `isError: true` before calling the API. Any Stackby API error is surfaced unchanged.

### Example — disable an automation

```json
{
  "stackId": "st_abc123",
  "automationId": "auto_xyz789",
  "body": {
    "isTurnedOn": false,
    "description": "Disabled pending review"
  }
}
```

---

## delete_automation

Permanently deletes an automation workflow, including all of its triggers and action steps.

**API:** `DELETE /api/v1/mcp/stacks/:stackId/automations/:automationId`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stackId` | string | Yes | Stack ID |
| `automationId` | string | Yes | Automation ID |

### Response

Returns the raw API confirmation response as pretty-printed JSON.

### Error behavior

If `stackId` or `automationId` is missing, the tool returns an error with `isError: true`. Any Stackby API error is surfaced unchanged.

### Example

```json
{
  "stackId": "st_abc123",
  "automationId": "auto_xyz789"
}
```

---

## add_automation_trigger

Adds a trigger to an existing automation. Use this when building automations step-by-step rather than with `create_automation`.

**API:** `POST /api/v1/mcp/stacks/:stackId/automation-triggers/create`

The body sent to the backend is:

```json
{
  "triggeredAutomationId": "<automationId>",
  "triggerType": "<triggerType>",
  "triggerParams": { ... },
  "tableId": "<tableId>",
  "description": "<description>",
  "stackId": "<stackId>"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stackId` | string | Yes | Stack ID |
| `automationId` | string | Yes | Automation to attach the trigger to |
| `triggerType` | string | Yes | Trigger type code — see [Trigger Type Codes](#trigger-type-codes) |
| `triggerParams` | object | No | Trigger-specific configuration — shape varies by type |
| `tableId` | string | No | Table the trigger watches |
| `description` | string | No | Trigger description |

### Response

Returns the created trigger object including its `id`.

### Error behavior

If `stackId`, `automationId`, or `triggerType` is missing, the tool returns an error with `isError: true`. Any Stackby API error is surfaced unchanged.

### Example — add a scheduled trigger

```json
{
  "stackId": "st_abc123",
  "automationId": "auto_xyz789",
  "triggerType": "SD_TIME",
  "tableId": "tb_tasks456",
  "triggerParams": {
    "interval": "days",
    "days": {
      "every": 1,
      "startAtDate": "2026-06-01T08:00:00.000Z"
    },
    "nextTriggerTime": "2026-06-02T08:00:00.000Z"
  }
}
```

---

## add_automation_action

Adds an action step to an existing automation. Use this when building automations step-by-step, or when you need to add an action to an automation that was already created.

**API:** `POST /api/v1/mcp/stacks/:stackId/automation-actions/create`

The body sent to the backend is:

```json
{
  "triggeredAutomationId": "<automationId>",
  "actionType": "<actionType>",
  "actionParams": { ... },
  "sequence": 1,
  "description": "<description>",
  "stackId": "<stackId>"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stackId` | string | Yes | Stack ID |
| `automationId` | string | Yes | Automation to attach the action to |
| `actionType` | string | Yes | Action type code — see [Action Type Codes](#action-type-codes) |
| `actionParams` | object | No | Action-specific configuration — shape varies by type |
| `sequence` | number | No | Execution order among action steps (positive integer) |
| `description` | string | No | Action description |

### Response

Returns the created action object including its `id`.

### Error behavior

If `stackId`, `automationId`, or `actionType` is missing, the tool returns an error with `isError: true`. Any Stackby API error is surfaced unchanged.

### Example — add a Slack notification action

```json
{
  "stackId": "st_abc123",
  "automationId": "auto_xyz789",
  "actionType": "SLACK",
  "sequence": 2,
  "description": "Post to #sales-alerts",
  "actionParams": {
    "channelId": "C0123456789",
    "accessToken": "xoxb-your-bot-token",
    "message": "New lead added: {{Name}}",
    "botName": "Stackby Bot",
    "icon_url": "https://stackby.com/favicon.ico"
  }
}
```

---

## automation_workflow_action

Advanced passthrough for workflow-level backend operations. The `body` is forwarded as-is (with `stackId` injected if not already present) to `POST /api/v1/mcp/stacks/:stackId/automation-workflows/:action`. Use this for operations that have no dedicated high-level tool.

**API:** `POST /api/v1/mcp/stacks/:stackId/automation-workflows/:action`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stackId` | string | Yes | Stack ID |
| `action` | string | Yes | Workflow action name — must be one of the valid values below |
| `body` | object | No | Action payload forwarded as-is to the Stackby backend |

### Valid `action` values

| Value | Description |
|-------|-------------|
| `create` | Create a new automation workflow |
| `update` | Update workflow metadata |
| `delete` | Delete a workflow |
| `details` | Get full workflow details |
| `updateSequence` | Reorder workflows |
| `duplicate` | Duplicate a workflow |
| `runCount` | Get the run count for a workflow |
| `sectioncreate` | Create a workflow section |
| `sectionrename` | Rename a workflow section |
| `sectiondelete` | Delete a workflow section |
| `addtosection` | Move a workflow into a section |
| `sectionmove` | Reorder sections |
| `sectionexpand` | Expand/collapse a section |
| `updateDescription` | Update the workflow description |

### Error behavior

If `stackId` or `action` is missing, the tool returns an error with `isError: true`. Any Stackby API error is surfaced unchanged.

### Example — duplicate a workflow

```json
{
  "stackId": "st_abc123",
  "action": "duplicate",
  "body": {
    "automationId": "auto_xyz789"
  }
}
```

---

## automation_trigger_action

Advanced passthrough for trigger-level backend operations. The `body` is forwarded as-is (with `stackId` injected) to `POST /api/v1/mcp/stacks/:stackId/automation-triggers/:action`.

**API:** `POST /api/v1/mcp/stacks/:stackId/automation-triggers/:action`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stackId` | string | Yes | Stack ID |
| `action` | string | Yes | Trigger action name — must be one of the valid values below |
| `body` | object | No | Action payload forwarded as-is to the Stackby backend |

### Valid `action` values

| Value | Description |
|-------|-------------|
| `create` | Create a new trigger (same as `add_automation_trigger` but lower-level) |
| `update` | Update an existing trigger's configuration |
| `delete` | Delete a trigger |
| `list` | List all triggers for an automation |
| `trigger` | Manually fire a trigger (test mode) |

### Error behavior

If `stackId` or `action` is missing, the tool returns an error with `isError: true`. Any Stackby API error is surfaced unchanged.

### Example — list triggers on an automation

```json
{
  "stackId": "st_abc123",
  "action": "list",
  "body": {
    "triggeredAutomationId": "auto_xyz789"
  }
}
```

---

## automation_action_action

Advanced passthrough for action-step backend operations. The `body` is forwarded as-is (with `stackId` injected) to `POST /api/v1/mcp/stacks/:stackId/automation-actions/:action`.

**API:** `POST /api/v1/mcp/stacks/:stackId/automation-actions/:action`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stackId` | string | Yes | Stack ID |
| `action` | string | Yes | Action-step operation name — must be one of the valid values below |
| `body` | object | No | Action payload forwarded as-is to the Stackby backend |

### Valid `action` values

| Value | Description |
|-------|-------------|
| `create` | Create a new action step (same as `add_automation_action` but lower-level) |
| `update` | Update an existing action step's configuration |
| `delete` | Delete an action step |
| `list` | List all action steps for an automation |
| `action` | Execute or test a specific action step |
| `updateSequence` | Reorder action steps |
| `duplicate` | Duplicate an action step |
| `updateDescription` | Update an action step's description |

### Error behavior

If `stackId` or `action` is missing, the tool returns an error with `isError: true`. Any Stackby API error is surfaced unchanged.

### Example — reorder action steps

```json
{
  "stackId": "st_abc123",
  "action": "updateSequence",
  "body": {
    "triggeredAutomationId": "auto_xyz789",
    "actionIds": ["ac_step1", "ac_step3", "ac_step2"]
  }
}
```

---

## Trigger Type Codes

Use these codes as the `triggerType` value in `create_automation`, `add_automation_trigger`, or `automation_trigger_action`. Call `list_automation_capabilities` to fetch this catalog from the MCP server at runtime.

| Code | Name | Description | Primary `triggerParams` fields |
|------|------|-------------|-------------------------------|
| `T_CR_ROW` | Row Created | Fires when a new row is added to the trigger table | None required beyond `tableId` |
| `T_UP_ROW` | Row Updated | Fires when any row in the trigger table is updated | `watchingColumns`, `columnList`, `testStepSelectedRow` |
| `SD_TIME` | Scheduled Time | Fires on a schedule or at a specific date/time | `interval`, schedule-specific object, `nextTriggerTime` |
| `WH_RECV` | Webhook Received | Fires when an incoming webhook hits the automation | Webhook-specific config (varies by integration) |
| `RW_COND` | Row Matches Conditions | Fires when a row enters or re-enters a matching condition | `filterData.filterSet`, `testStepSelectedRow` |
| `VM_ROW` | View Matched Row | Fires when a row matches a view's filter criteria | `viewId`, `testStepSelectedRow` |

### T_CR_ROW — Row Created

Fires every time a new row is created in the trigger table. No `triggerParams` configuration is typically required.

```json
{
  "triggerType": "T_CR_ROW",
  "tableId": "tb_leads456",
  "triggerParams": {}
}
```

**Notes:** The trigger table is set via `tableId` at the trigger level (or the automation's top-level `tableId`), not inside `triggerParams`.

---

### T_UP_ROW — Row Updated

Fires when any row in the trigger table is updated. Use `watchingColumns` to restrict the trigger to specific columns.

```json
{
  "triggerType": "T_UP_ROW",
  "tableId": "tb_tasks456",
  "triggerParams": {
    "watchingColumns": ["cl_status", "cl_assignee"],
    "columnList": ["cl_status", "cl_assignee"],
    "testStepSelectedRow": "rw_sample123"
  }
}
```

**Notes:**
- `watchingColumns` and `columnList` are both read by the backend; providing both ensures compatibility.
- `testStepSelectedRow` sets the sample row used when testing the automation in the Stackby UI — it is not required for production use.

---

### SD_TIME — Scheduled Time

Fires on a recurring schedule or once at a specific date and time. The `interval` field determines the schedule bucket; the schedule-specific object (e.g. `days`, `hours`, `weeks`) provides the cadence details.

```json
{
  "triggerType": "SD_TIME",
  "triggerParams": {
    "interval": "days",
    "days": {
      "every": 1,
      "startAtDate": "2026-06-01T08:00:00.000Z"
    },
    "nextTriggerTime": "2026-06-02T08:00:00.000Z"
  }
}
```

**Supported `interval` values:** `minutes`, `hours`, `days`, `weeks`, `months`, `oneTime`

**Notes:** `nextTriggerTime` is maintained by the backend after the first trigger fires. Setting it on creation tells Stackby when the first run should occur.

---

### WH_RECV — Webhook Received

Fires when an incoming HTTP webhook request reaches the automation's webhook URL. The exact `triggerParams` shape depends on the webhook integration being used.

```json
{
  "triggerType": "WH_RECV",
  "triggerParams": {}
}
```

**Notes:** After creating the trigger, retrieve the automation details via `get_automation` to find the generated webhook URL.

---

### RW_COND — Row Matches Conditions

Fires when a row enters or re-enters a state that satisfies the specified filter conditions.

```json
{
  "triggerType": "RW_COND",
  "tableId": "tb_tasks456",
  "triggerParams": {
    "filterData": {
      "filterSet": [
        {
          "columnId": "cl_status",
          "operator": "is",
          "value": "Overdue"
        },
        {
          "columnId": "cl_priority",
          "operator": "is",
          "value": "High"
        }
      ]
    },
    "testStepSelectedRow": "rw_sample123"
  }
}
```

**Notes:** The `filterSet` array follows the same condition format used in view filters. The `operator` values correspond to Stackby's condition operators (e.g. `is`, `isNot`, `contains`, `isEmpty`).

---

### VM_ROW — View Matched Row

Fires when a row enters the result set of a specific view (i.e. the view's filters start returning that row).

```json
{
  "triggerType": "VM_ROW",
  "tableId": "tb_tasks456",
  "triggerParams": {
    "viewId": "vi_overdue789",
    "testStepSelectedRow": "rw_sample123"
  }
}
```

**Notes:** The `viewId` inside `triggerParams` is the view whose filter conditions define the matching criteria. Use `list_views` to get view IDs.

---

## Action Type Codes

Use these codes as the `actionType` value in `create_automation`, `add_automation_action`, or `automation_action_action`. Call `list_automation_capabilities` to fetch this catalog from the MCP server at runtime.

| Code | Name | Description | Key `actionParams` fields |
|------|------|-------------|--------------------------|
| `CR_ROW` | Create Record | Creates a new row in a target table | `tableId`, `column` (field map) |
| `UP_ROW` | Update Record | Updates an existing row in a target table | `tableId`, `rowId`, `column` (field map) |
| `FIND_ROW` | Find Record | Looks up rows for use in later steps | `tableId`, `findOn`, `filterData` or `viewId` |
| `S_EMAIL` | Send Email | Sends an email via Stackby automation | `toWithColumnId`, `subjectWithColumnId`, `messageWithColumnId` |
| `WHATSAPP` | Send WhatsApp | Sends a WhatsApp message | `apiConfigId`, `templateName`, `whatsappActionObj` |
| `GMAIL` | Send Gmail | Sends email via Gmail integration | `toWithColumnId`, `subjectWithColumnId`, `messageWithColumnId` |
| `OUTLOOK` | Send Outlook | Sends email via Outlook integration | `toWithColumnId`, `subjectWithColumnId`, `messageWithColumnId` |
| `MS_TEAM` | Send to MS Teams | Posts a message to a Microsoft Teams channel | `teamId`, `channelId`, `accessToken`, `body` |
| `SLACK` | Send to Slack | Posts a message to a Slack channel | `channelId`, `accessToken`, `message` |
| `SORT` | Sort Records | Sorts the records found by a prior FIND_ROW step | `findActionId`, `sort` array |
| `AI_GEN` | AI Generate | Generates content using an AI model | `findActionId`, `columnCellvalues`, `column` |

### CR_ROW — Create Record

Creates a new row in a target table. The `column` map keys are target column IDs and values are either static strings or dynamic references to trigger data (e.g. `"tb_source123 cl_title"` reads the `cl_title` field from the trigger row in `tb_source123`).

```json
{
  "actionType": "CR_ROW",
  "actionParams": {
    "tableId": "tb_tasks456",
    "column": {
      "cl_name": "tb_leads123 cl_company",
      "cl_status": "New",
      "cl_assignee": "tb_leads123 cl_owner"
    }
  }
}
```

---

### UP_ROW — Update Record

Updates an existing row. `rowId` can be a literal row ID or a dynamic reference resolved by the backend. The `column` map follows the same format as `CR_ROW`.

```json
{
  "actionType": "UP_ROW",
  "actionParams": {
    "tableId": "tb_tasks456",
    "rowId": "tb_leads123 cl_linked_task",
    "column": {
      "cl_status": "In Progress",
      "cl_updated_by": "Automation"
    }
  }
}
```

---

### FIND_ROW — Find Record

Looks up rows to use in subsequent action steps. The `findOn` field determines whether rows are found by condition or by view.

```json
{
  "actionType": "FIND_ROW",
  "actionParams": {
    "tableId": "tb_tasks456",
    "findOn": "condition",
    "maximumRow": 25,
    "filterData": {
      "filterSet": [
        {
          "columnId": "cl_status",
          "operator": "is",
          "value": "tb_leads123 cl_status"
        }
      ]
    }
  }
}
```

**Finding by view:**

```json
{
  "actionType": "FIND_ROW",
  "actionParams": {
    "tableId": "tb_tasks456",
    "findOn": "view",
    "viewId": "vi_openTasks789"
  }
}
```

**Notes:** The result of this action is referenced by subsequent `UP_ROW`, `SORT`, or `AI_GEN` actions using `findActionId`.

---

### S_EMAIL — Send Email

Sends an email from the Stackby automation system. Field values use `...WithColumnId` naming: the value can be a static string or a dynamic column reference (e.g. `"tb_leads123 cl_email"` reads the email field from the trigger table).

```json
{
  "actionType": "S_EMAIL",
  "actionParams": {
    "toWithColumnId": "tb_leads123 cl_email",
    "subjectWithColumnId": "Follow-up: {{Name}}",
    "messageWithColumnId": "Hi {{Name}}, we wanted to follow up on your request.",
    "ccWithColumnId": "",
    "bccWithColumnId": "",
    "fromNameWithColumnId": "Stackby Automations",
    "replyToWithColumnId": "",
    "attechmentWithColumnId": []
  }
}
```

**Notes:** `attechmentWithColumnId` uses the backend's spelling (one `t` in `attachment`).

---

### WHATSAPP — Send WhatsApp

Sends a WhatsApp message using a pre-configured WhatsApp integration. Requires a WhatsApp API configuration ID set up in Stackby and a pre-approved message template.

```json
{
  "actionType": "WHATSAPP",
  "actionParams": {
    "apiConfigId": "wa_config_abc123",
    "templateName": "order_shipped",
    "whatsappActionObj": {
      "sendto": ["tb_orders123 cl_customer_phone"],
      "header": [],
      "body": ["Your order {{Name}} has shipped!"],
      "buttons": []
    }
  }
}
```

---

### GMAIL — Send Gmail

Sends an email via a connected Gmail account. Uses the same `...WithColumnId` field pattern as `S_EMAIL`.

```json
{
  "actionType": "GMAIL",
  "actionParams": {
    "toWithColumnId": "tb_leads123 cl_email",
    "subjectWithColumnId": "Update from our team",
    "messageWithColumnId": "Hello {{Name}}, here is your update."
  }
}
```

---

### OUTLOOK — Send Outlook

Sends an email via a connected Outlook account. Uses the same `...WithColumnId` field pattern as `S_EMAIL`.

```json
{
  "actionType": "OUTLOOK",
  "actionParams": {
    "toWithColumnId": "tb_leads123 cl_email",
    "subjectWithColumnId": "Important update",
    "messageWithColumnId": "Dear {{Name}}, please review the following."
  }
}
```

---

### MS_TEAM — Send to Microsoft Teams

Posts a message to a Microsoft Teams channel using a connected Teams integration.

```json
{
  "actionType": "MS_TEAM",
  "actionParams": {
    "teamId": "19:team_channel_id@thread.tacv2",
    "channelId": "19:channel_id@thread.tacv2",
    "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGci...",
    "refreshToken": "0.AXoA...",
    "body": "New record created: {{Name}} — assigned to {{Assignee}}"
  }
}
```

---

### SLACK — Send to Slack

Posts a message to a Slack channel using a connected Slack bot integration.

```json
{
  "actionType": "SLACK",
  "actionParams": {
    "channelId": "C0123456789",
    "accessToken": "xoxb-your-slack-bot-token",
    "message": "New lead: {{Name}} from {{Company}}",
    "botName": "Stackby Bot",
    "icon_url": "https://stackby.com/favicon.ico"
  }
}
```

---

### SORT — Sort Records

Sorts the results of a prior `FIND_ROW` action step. Reference the `FIND_ROW` step's action ID via `findActionId`.

```json
{
  "actionType": "SORT",
  "actionParams": {
    "findActionId": "ac_findStep001",
    "sort": [
      { "columnId": "cl_priority", "direction": "asc" },
      { "columnId": "cl_due_date", "direction": "asc" }
    ]
  }
}
```

---

### AI_GEN — AI Generate

Generates content using a Stackby AI step. References a prior `FIND_ROW` action for the source rows and writes the generated output to specified columns.

```json
{
  "actionType": "AI_GEN",
  "actionParams": {
    "findActionId": "ac_findStep001",
    "columnCellvalues": {
      "cl_description": {
        "str": "Summarize this lead's requirements in one sentence: {{cl_notes}}"
      }
    },
    "aiActionConfig": {},
    "column": {
      "cl_ai_summary": "Generated summary goes here"
    },
    "generatedData": {}
  }
}
```

---

## Recommended Workflow Patterns

### Pattern 1 — Simple automation (single call)

Use `create_automation` for most use cases. It creates the full automation in one request:

1. Call `list_automation_capabilities` to browse trigger/action codes and examples.
2. Call `list_tables` and `list_views` to get the IDs you need.
3. Call `create_automation` with `trigger` and `actions` populated.

### Pattern 2 — Step-by-step build

Use individual tools when you need to inspect results or add steps incrementally:

1. Call `create_automation` with only `trigger` (no `actions`) to create the workflow skeleton.
2. Call `add_automation_action` one or more times to append action steps.
3. Call `update_automation` to enable the automation (`isTurnedOn: true`).

### Pattern 3 — Advanced operations

Use the passthrough tools (`automation_workflow_action`, `automation_trigger_action`, `automation_action_action`) for operations like duplicating workflows, reordering steps, or managing sections — functionality that the high-level tools do not expose directly.

### Referencing trigger data in action params

Inside `actionParams`, dynamic column references follow the format `"<tableId> <columnId>"` — for example, `"tb_leads123 cl_email"` reads the `cl_email` column from the `tb_leads123` table's trigger row. Static strings (e.g. `"Open"`, `"sales@example.com"`) are used as-is.

Template variables in the form `{{ColumnName}}` are interpolated by the Stackby backend at runtime using the trigger row's values.

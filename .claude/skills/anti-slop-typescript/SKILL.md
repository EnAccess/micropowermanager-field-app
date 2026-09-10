---
name: anti-slop-typescript
description: Simplify TypeScript code by removing defensive over-engineering, fake type safety, unnecessary helpers, redundant runtime checks, and abstraction noise.
---

# TypeScript Anti-Slop

Apply these rules whenever modifying TypeScript or JavaScript code.

The goal is simple, readable, strongly typed code that trusts the type system and validates only at real boundaries.

## Core rule

> Validate untrusted data once at the boundary. Trust typed application code everywhere else.

Do not repeatedly rediscover types that the application already knows.

---

# 1. Do not propagate `unknown` unnecessarily

Be suspicious of:

```ts
value: unknown
data: unknown
payload: unknown
Record<string, unknown>
```

inside normal application code.

If the shape is known, use the actual type.

Bad:

```ts
const asDomainMapEventData = (
  value: unknown,
): DomainMapEventData => {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  return value as DomainMapEventData;
};
```

Good:

```ts
const handleDomainMap = (
  data: DomainMapEventData,
) => {
  // ...
};
```

Fix broad typing at the source instead of adding `asX()` helpers downstream.

---

# 2. Do not replace simple casts with runtime ceremony

Do not assume `as` is always bad.

Bad cleanup:

```ts
return (
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === DUPLICATE_KEY_ERROR_CODE
);
```

when this is sufficient and clearer:

```ts
return (
  error as { code?: number }
)?.code === DUPLICATE_KEY_ERROR_CODE;
```

Use runtime validation when the value is genuinely untrusted.

Do not add five checks merely to avoid one intentional cast.

---

# 3. Remove fake validation

This is not real validation:

```ts
if (
  typeof value === "object" &&
  value !== null
) {
  return value as Project;
}
```

Either trust the value:

```ts
return value as Project;
```

at a known integration point,

or validate it properly at the boundary with the project's existing schema library.

Do not write verbose checks that still end with an unsafe cast.

---

# 4. Fix the type instead of adding extraction helpers

Bad:

```ts
private domainIdFrom(
  document: Record<string, unknown> | undefined,
): string | undefined {
  const domain = document?.domain;

  return domain instanceof Types.ObjectId
    ? domain.toHexString()
    : undefined;
}
```

If the document shape is known, type it correctly:

```ts
interface DnsDocument {
  domain: Types.ObjectId;
}
```

Then:

```ts
return change.fullDocument?.domain.toHexString();
```

Do not add:

```txt
domainIdFrom
projectIdFrom
userIdFrom
stringFrom
objectIdFrom
fieldFrom
```

to compensate for bad upstream typing.

---

# 5. Avoid generic converters

Be suspicious of:

```ts
toString()
asString()
safeString()
stringifyValue()
normalizeValue()
toNumber()
asBoolean()
toRecord()
asRecord()
```

Bad:

```ts
const stringify = (value: unknown): string => {
  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return `${value}`;
  }

  if (value == null) {
    return "";
  }

  if (value instanceof Types.ObjectId) {
    return value.toHexString();
  }

  return inspect(value);
};
```

Ask:

> What is this value actually supposed to be?

If it is a string, type it as a string.

If it is an ObjectId, type it as an ObjectId.

Do not write universal conversion utilities unless the application genuinely needs arbitrary-value serialization.

---

# 6. Do not broaden types for "flexibility"

Bad:

```ts
const normalizeDomainName = (
  value: unknown,
): string => {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }

  if (typeof value === "number") {
    return `${value}`.trim().toLowerCase();
  }

  return "";
};
```

A domain name should not randomly be a number.

Prefer:

```ts
const normalizeDomainName = (
  domain: string,
): string => {
  return domain.trim().toLowerCase();
};
```

Do not make function inputs broader than the actual domain model.

---

# 7. Avoid silent empty fallbacks

Search for:

```ts
return "";
return {};
return [];
return undefined;
return null;

value ?? "";
value || "";
value ?? {};
value || {};
value ?? [];
value || [];
```

when they hide invalid states.

Bad:

```ts
if (!project) {
  return {};
}
```

If the project is required:

```ts
if (!project) {
  throw new ProjectNotFoundError();
}
```

If it is truly optional, model that in the type.

Do not silently degrade invalid application state into empty values.

---

# 8. Do not use optional chaining defensively everywhere

Bad:

```ts
data?.project?.config?.domain?.name
```

when the type guarantees those fields.

Prefer:

```ts
data.project.config.domain.name
```

Use optional chaining only when the value is genuinely optional.

Optional chaining should reflect the domain model, not uncertainty about the codebase.

---

# 9. Remove unnecessary runtime checks for typed values

Bad:

```ts
if (
  typeof project.id !== "string"
) {
  return "";
}
```

when:

```ts
interface Project {
  id: string;
}
```

already guarantees it.

Trust the type.

If the type is wrong, fix the type or validate at the boundary.

---

# 10. Remove generic record accessors

Be suspicious of:

```ts
isRecord()
asRecord()
toRecord()
getString()
getNumber()
getBoolean()
getOptionalString()
```

Bad:

```ts
const project = asRecord(data.project);
const id = getString(project, "id");
```

Good:

```ts
const id = data.project.id;
```

If the code relies heavily on:

```ts
Record<string, unknown>
```

fix the architecture.

---

# 11. Type queue events properly

Bad:

```ts
type QueuePayload = {
  event: string;
  data: unknown;
};
```

followed by:

```ts
asDomainMapEventData(data)
asDomainUnmapEventData(data)
asProjectSyncEventData(data)
```

Prefer a discriminated union:

```ts
type QueueEvent =
  | {
      event: "domain.map";
      data: DomainMapEventData;
    }
  | {
      event: "domain.unmap";
      data: DomainUnmapEventData;
    }
  | {
      event: "project.ratelimit.sync";
      data: ProjectRatelimitSyncEventData;
    };
```

Then:

```ts
switch (event.event) {
  case "domain.map":
    return handleDomainMap(event.data);

  case "domain.unmap":
    return handleDomainUnmap(event.data);
}
```

Do not carry `unknown` into business logic.

---

# 12. Validate queue/HTTP/webhook data once

Real boundaries include:

- HTTP requests
- webhooks
- queue messages
- external APIs
- environment variables
- raw database JSON
- user input

Validate there.

Then convert to a precise internal type.

Use the validation library already present in the codebase.

Do not introduce another schema library without a strong reason.

---

# 13. Remove helper explosion

Be suspicious of helpers that:

- have one caller
- are 1–3 lines
- only access a field
- only call `.trim()`
- only call `.toLowerCase()`
- only cast a type
- only check null
- only return a default
- only forward arguments

Bad:

```ts
const getDomain = (
  data: DomainData,
): string => data.domain;
```

Prefer:

```ts
data.domain
```

A helper should represent a real concept.

---

# 14. Remove pass-through wrappers

Bad:

```ts
async getProject(id: string) {
  return this.projectService.getProject(id);
}
```

when the wrapper adds no business logic, policy, mapping, or meaningful boundary.

Do not preserve layers solely because they exist.

---

# 15. Avoid unnecessary DTO duplication

Be suspicious of:

```txt
Project
ProjectData
ProjectDTO
ProjectInput
ProjectPayload
ProjectParams
ProjectResponse
ProjectModel
```

with nearly identical fields.

Separate types when the contracts are materially different.

Do not duplicate shapes just because each layer "should have its own type."

---

# 16. Remove mapper/converter slop

Audit functions like:

```txt
toDTO
fromDTO
toModel
fromModel
toEntity
fromEntity
toPayload
fromPayload
```

If the source and target types are effectively identical, remove the unnecessary representation.

Do not maintain mapping code for no semantic reason.

---

# 17. Avoid pointless interfaces

Do not create interfaces merely because a class exists.

Bad:

```ts
interface ProjectService {
  getProject(id: string): Promise<Project>;
}

class ProjectServiceImpl
  implements ProjectService {
}
```

when there is only one implementation and no meaningful consumer abstraction.

Prefer the concrete class.

Interfaces should solve a real problem.

---

# 18. Avoid Java-style architecture

Be suspicious of chains like:

```txt
Controller
→ Service
→ Manager
→ Processor
→ Handler
→ Repository
→ Store
```

when most layers just forward data.

Collapse pass-through layers.

Prefer fewer meaningful layers.

---

# 19. Do not over-abstract duplicated code

Two similar lines do not automatically need a generic helper.

Bad:

```ts
const normalizeValue = <T>(
  value: T,
  normalizer: (value: T) => T,
): T => normalizer(value);
```

Prefer obvious duplication over a generic abstraction that makes code harder to trace.

---

# 20. Avoid unnecessary generics

Be suspicious of:

```ts
function safeCast<T>()
function getValue<T>()
function normalize<T>()
function parseValue<T>()
function ensure<T>()
```

when concrete types would be clearer.

Generics should solve a real reusable problem.

Do not use them merely to make helpers appear reusable.

---

# 21. Avoid unnecessary type aliases

Question aliases like:

```ts
type DomainString = string;
type EventValue = unknown;
type GenericData = Record<string, unknown>;
```

Keep aliases when they add domain meaning or improve safety.

Do not create aliases that only rename primitives without value.

---

# 22. Prefer discriminated unions

If states are mutually exclusive, model them properly.

Bad:

```ts
interface Deployment {
  type: string;
  web?: WebDeployment;
  worker?: WorkerDeployment;
}
```

Prefer:

```ts
type Deployment =
  | {
      type: "web";
      web: WebDeployment;
    }
  | {
      type: "worker";
      worker: WorkerDeployment;
    };
```

Make impossible states impossible.

---

# 23. Avoid defensive `String`, `Boolean`, `Number`

Search for:

```ts
String(value)
Boolean(value)
Number(value)
`${value}`
!!value
```

when the type already guarantees the primitive.

Bad:

```ts
const projectId = String(project.id);
```

when `project.id` is already a string.

Prefer:

```ts
const projectId = project.id;
```

Do not coerce values unnecessarily.

---

# 24. Avoid arbitrary coercion

Bad:

```ts
String(undefined)
Number("")
Boolean("false")
```

can produce misleading values.

Do not use coercion as validation.

Model valid values correctly.

---

# 25. Do not normalize values that should never be valid

Bad:

```ts
if (typeof value === "number") {
  return String(value);
}
```

for a domain name, email, UUID, hostname, event name, etc.

Do not make nonsensical values "work."

Reject them at the boundary or prevent them via types.

---

# 26. Keep meaningful normalization

This is fine:

```ts
const domain =
  input.domain.trim().toLowerCase();
```

if the input comes from a user-controlled boundary.

The issue is not normalization.

The issue is accepting arbitrary types and silently coercing them.

---

# 27. Simplify boolean logic

Bad:

```ts
let shouldProcess = false;

if (event) {
  if (event.enabled === true) {
    shouldProcess = true;
  }
}
```

Prefer:

```ts
const shouldProcess =
  event?.enabled === true;
```

But do not create unreadable boolean one-liners.

Prefer readability.

---

# 28. Avoid nested ternaries

Do not use nested ternaries.

Bad:

```ts
const value = active
  ? enabled
    ? "a"
    : "b"
  : "c";
```

Use `if`, `switch`, or a simple variable assignment.

Ternaries should be short and obvious.

---

# 29. Prefer early returns

Bad:

```ts
if (project) {
  if (project.enabled) {
    if (project.status === "active") {
      // 50 lines
    }
  }
}
```

Prefer:

```ts
if (!project) {
  return;
}

if (!project.enabled) {
  return;
}

if (project.status !== "active") {
  return;
}

// main logic
```

Keep the happy path clear.

---

# 30. Remove useless intermediate variables

Bad:

```ts
const rawDomain = data.domain;
const normalizedDomain =
  normalizeDomainName(rawDomain);
const domain = normalizedDomain;
```

Prefer:

```ts
const domain =
  data.domain.trim().toLowerCase();
```

Intermediate variables should clarify meaning, not inflate code.

---

# 31. Remove obvious comments

Delete comments that narrate syntax.

Bad:

```ts
// Check if project exists
if (!project) {
```

Bad:

```ts
// Convert ObjectId to string
const id = objectId.toHexString();
```

Keep comments for:

- business rules
- unusual constraints
- workarounds
- external quirks
- important invariants

Explain why, not what.

---

# 32. Do not catch errors just to hide them

Bad:

```ts
try {
  await operation();
} catch {
  return undefined;
}
```

Bad:

```ts
try {
  await operation();
} catch (error) {
  console.log(error);
}
```

Determine whether the failure is genuinely recoverable.

Do not silently swallow errors.

---

# 33. Avoid useless catch-and-rethrow

Bad:

```ts
try {
  return await service.run();
} catch (error) {
  throw error;
}
```

Remove the `try/catch`.

Only catch when you are:

- translating the error
- adding meaningful context
- cleaning resources
- intentionally recovering

---

# 34. Do not wrap errors at every layer

Avoid:

```txt
Failed to process project:
Failed to load project:
Failed to fetch project:
Database error:
actual error
```

Add context where it materially improves debugging.

Do not mechanically wrap every call.

---

# 35. Avoid generic "safe" helpers

Treat names like these as suspicious:

```txt
safeGet
safeString
safeNumber
safeParse
safeObject
safeArray
ensureObject
ensureString
ensureArray
```

They often hide bad typing.

Fix the source type instead.

---

# 36. Avoid unnecessary builders/factories

Bad:

```ts
new DeploymentBuilder()
  .withProjectId(projectId)
  .withRegion(region)
  .withPort(port)
  .build();
```

when:

```ts
const deployment: Deployment = {
  projectId,
  region,
  port,
};
```

is clearer.

Likewise, do not add factories unless runtime selection or construction complexity actually exists.

---

# 37. Avoid unnecessary dependency injection abstractions

Normal constructor injection is enough:

```ts
new ProjectService(
  projectRepository,
  logger,
);
```

Do not add:

```txt
Container
Registry
Provider
Resolver
ServiceLocator
```

without a real need.

---

# 38. Avoid overly generic utility modules

Audit files/folders named:

```txt
utils
helpers
common
shared
base
core
misc
```

Delete trivial helpers.

Move domain-specific helpers to the domain that owns them.

Do not create another generic utility dumping ground.

---

# 39. Avoid premature reuse

If two call sites happen to look similar, do not automatically extract them.

Ask:

> Is the shared concept real?

If not, leave the code explicit.

Small duplication can be cheaper than a bad abstraction.

---

# 40. Avoid unnecessary callbacks

Bad:

```ts
processValue(
  value,
  (value) => normalize(value),
);
```

when:

```ts
normalize(value);
```

is sufficient.

Do not turn normal calls into callback APIs without a reason.

---

# 41. Avoid unnecessary Promise wrappers

Bad:

```ts
return new Promise(
  async (resolve, reject) => {
    try {
      resolve(await run());
    } catch (error) {
      reject(error);
    }
  },
);
```

Prefer:

```ts
return run();
```

Do not wrap promises that already exist.

---

# 42. Avoid unnecessary `async`

Bad:

```ts
async function getValue() {
  return Promise.resolve(value);
}
```

or:

```ts
async function getProject() {
  return repository.getProject();
}
```

when no `await` or async boundary is required.

Remove unnecessary `async` where it adds no value.

---

# 43. Avoid unnecessary spreading/cloning

Be suspicious of:

```ts
return {
  ...value,
};
```

or:

```ts
const copy = [...items];
```

if there is no ownership/mutation reason.

Do not allocate "for safety" without a real requirement.

---

# 44. Avoid defensive defaults in constructors

Bad:

```ts
constructor(
  private readonly config:
    Config = {} as Config,
) {}
```

If the dependency is required, require it.

Do not silently construct invalid objects.

---

# 45. Avoid optional fields by default

Do not write:

```ts
interface Project {
  id?: string;
  name?: string;
  config?: Config;
}
```

just because data could theoretically be incomplete.

If the application requires them:

```ts
interface Project {
  id: string;
  name: string;
  config: Config;
}
```

Optionality should reflect real business semantics.

---

# 46. Avoid nullable unions without reason

Question:

```ts
string | null | undefined
```

when only one absence state is necessary.

Do not proliferate multiple empty states without a contract requiring them.

---

# 47. Avoid defensive `instanceof` chains

Bad:

```ts
if (value instanceof ObjectId) {
  // ...
} else if (typeof value === "string") {
  // ...
} else if (typeof value === "number") {
  // ...
}
```

when the domain says the value is an ObjectId.

Type it correctly.

---

# 48. Do not use `inspect()` as a fallback serializer

If code reaches:

```ts
inspect(value)
```

because the program does not know the value's type, inspect the root cause.

Do not make arbitrary values printable and call that correctness.

---

# 49. Do not add logging for every internal step

Bad:

```ts
logger.debug("starting project lookup");
logger.debug("project found");
logger.debug("normalizing domain");
logger.debug("mapping domain");
```

Log meaningful operational events.

Do not narrate function execution.

---

# 50. Avoid logging and rethrowing everywhere

Bad:

```ts
catch (error) {
  logger.error(error);
  throw error;
}
```

when the caller also logs the same failure.

Prefer one responsible logging boundary.

---

# 51. Avoid classes where plain functions/types are enough

Do not create classes just to group stateless helpers.

Bad:

```ts
class DomainUtils {
  static normalize(domain: string) {
    // ...
  }
}
```

Prefer:

```ts
const normalizeDomain = (
  domain: string,
) => {
  // ...
};
```

Use classes when there is meaningful state or behavior.

---

# 52. Avoid excessive private methods

Be suspicious when one class has dozens of tiny private methods like:

```txt
getDomainId()
extractProject()
normalizeName()
resolveState()
buildPayload()
prepareData()
formatValue()
```

If they only make the reader jump around, inline them.

Private methods should clarify meaningful chunks of behavior.

---

# 53. Avoid one-use type guards

Bad:

```ts
const isDomainEvent = (
  value: unknown,
): value is DomainEvent => {
  // 12 lines
};
```

when it is used once inside a boundary that already has schema validation.

Do not duplicate schema validation with custom guards.

---

# 54. Prefer existing schema validation

If the project already uses:

```txt
Zod
Yup
Joi
Valibot
TypeBox
Ajv
```

use it at untrusted boundaries.

Do not create custom validation utilities beside it.

---

# 55. Do not introduce validation libraries unnecessarily

If a simple trusted internal type is sufficient, do not add Zod just to validate internal objects.

Boundary validation and internal typing are different concerns.

---

# 56. Avoid `Partial<T>` abuse

Be suspicious of:

```ts
Partial<Project>
Partial<Config>
Partial<EventData>
```

used deep in application logic.

If only some fields are needed, define the actual input type:

```ts
type ProjectUpdate = {
  name?: string;
  region?: string;
};
```

Do not weaken large domain types just for convenience.

---

# 57. Avoid `Record<string, X>` when keys are known

Bad:

```ts
Record<string, Handler>
```

when valid keys are known.

Prefer:

```ts
Record<EventName, Handler>
```

or a typed object.

Make invalid keys impossible where useful.

---

# 58. Avoid unsafe `as any`

Search for:

```ts
as any
```

Fix the type mismatch instead where practical.

Do not use `as any` merely to silence the compiler.

---

# 59. Do not overreact to every cast

At the same time, do not replace a small intentional cast with huge runtime narrowing.

Prefer an honest local cast over fake defensive machinery when the external contract guarantees the shape.

Use judgment.

---

# 60. Keep Mongo/Mongoose types concrete

For Mongoose/Mongo code, avoid:

```ts
Record<string, unknown>
unknown
any
```

for known document shapes.

Define the document type.

Bad:

```ts
const domain =
  document?.domain;

return domain instanceof Types.ObjectId
  ? domain.toHexString()
  : undefined;
```

when the schema guarantees:

```ts
domain: Types.ObjectId
```

Prefer:

```ts
return document?.domain.toHexString();
```

---

# 61. Do not duplicate Mongoose guarantees with runtime checks

If the schema and TypeScript types guarantee a field's type, do not repeatedly check:

```ts
instanceof Types.ObjectId
typeof value === "string"
```

inside normal application code.

Fix schema/type alignment if necessary.

---

# 62. Keep API boundaries strict

HTTP handlers should parse/validate external input.

Services should not receive:

```ts
unknown
Record<string, unknown>
```

unless they are themselves the parsing boundary.

Prefer:

```ts
service.createProject(input);
```

where `input` is already typed and validated.

---

# 63. Narrow service signatures

Bad:

```ts
syncProject(
  payload: ProjectSyncPayload,
)
```

when the function only needs:

```ts
projectId
rateLimit
```

Prefer:

```ts
syncProject(
  projectId: string,
  rateLimit: number,
)
```

Pass only what the function actually needs.

---

# 64. Remove meaningless wrapper types

Bad:

```ts
type ExistsResult = {
  exists: boolean;
};
```

when:

```ts
Promise<boolean>
```

is sufficient.

Use result objects when multiple related values need to travel together.

---

# 65. Avoid unnecessary enums

Do not turn every string into an enum.

Use enums or literal unions when there is a real closed set of values.

Prefer:

```ts
type Status =
  | "pending"
  | "running"
  | "failed";
```

when that fits the codebase.

Do not create abstractions around arbitrary strings for no reason.

---

# 66. Prefer simple `switch` over dispatch architecture

Do not turn:

```ts
switch (event.type) {
  case "insert":
  case "update":
  case "delete":
}
```

into:

```txt
HandlerRegistry
EventProcessor
StrategyFactory
EventHandlerInterface
```

unless dynamic registration is actually needed.

A switch is fine.

---

# 67. Avoid unnecessary strategy patterns

Three branches do not automatically need three classes.

Prefer direct control flow when easier to understand.

---

# 68. Do not abstract standard library behavior

Avoid custom wrappers around:

```ts
JSON.parse
Array.isArray
Object.keys
Object.entries
String.prototype.trim
String.prototype.toLowerCase
Map
Set
```

unless the wrapper adds meaningful domain behavior.

---

# 69. Remove dead abstractions after refactoring

If fixing a type makes these obsolete:

```txt
asX
isX
normalizeX
safeX
convertX
extractX
```

delete them.

Do not leave compatibility helpers behind unless they still have real callers and purpose.

---

# 70. Review code added by AI agents aggressively

Treat these patterns as suspicious:

```ts
const asX = (
  value: unknown,
): X => ...
```

```ts
const safeX = ...
```

```ts
const normalizeX = (
  value: unknown,
) => ...
```

```ts
if (
  typeof value === "object" &&
  value !== null &&
  "foo" in value
)
```

```ts
value ?? ""
```

```ts
value ?? {}
```

```ts
value ?? []
```

```ts
return inspect(value)
```

```ts
return String(value)
```

```ts
Record<string, unknown>
```

They are not automatically wrong, but they deserve scrutiny.

---

# 71. Do not make cleanup increase complexity

A refactor is suspicious if it turns:

```ts
return (
  error as { code?: number }
)?.code === DUPLICATE_KEY_ERROR_CODE;
```

into:

```ts
return (
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "number" &&
  error.code === DUPLICATE_KEY_ERROR_CODE
);
```

without adding meaningful correctness.

Likewise, replacing:

```ts
document.domain.toHexString()
```

with:

```ts
this.extractAndNormalizeDomainId(
  document,
)
```

is not an improvement.

---

# 72. Fix the root cause

Whenever you see:

```txt
asSomething
safeSomething
normalizeSomething
extractSomething
resolveSomething
convertSomething
```

trace the value upstream.

Ask:

1. Why is the value broad?
2. Where does it enter the application?
3. Is that the correct place to validate it?
4. Can the downstream type become precise?
5. Can the helper then disappear?

Prefer fixing the earliest sensible point in the data flow.

---

# 73. Preserve real defensive checks

Do not remove checks that protect against genuine uncertainty.

Keep handling for:

- external API failures
- database not-found cases
- nullable database fields
- malformed HTTP input
- malformed queue messages
- optional business fields
- Redis misses
- JSON parse failures
- security checks
- authorization checks
- external library behavior that is actually broad

The distinction is:

> Defend against external uncertainty, not against your own typed application code.

---

# 74. Preserve behavior

Do not:

- change business logic
- change public API behavior
- change event names
- change persistence formats
- remove security checks
- remove legitimate nullability
- introduce new dependencies without strong justification

This is a complexity reduction exercise.

---

# 75. Desired style

Prefer:

```ts
const handleDomainMap = async (
  data: DomainMapEventData,
) => {
  const domain =
    data.domain.trim().toLowerCase();

  await domainService.map({
    projectId: data.projectId,
    domain,
  });
};
```

over:

```ts
const handleDomainMap = async (
  rawData: unknown,
) => {
  const data =
    asDomainMapEventData(rawData);

  const projectId =
    asOptionalString(data.projectId);

  const domain =
    normalizeDomainName(
      getSafeValue(data.domain),
    );

  if (!projectId || !domain) {
    return;
  }

  await domainService.map({
    projectId,
    domain,
  });
};
```

---

# 76. Mandatory before-change review

Before editing code:

1. Identify the trusted and untrusted boundaries.
2. Understand the actual domain types.
3. Check whether broad types are accidental.
4. Avoid introducing helpers before understanding upstream typing.
5. Prefer modifying the root type/data flow over patching call sites.

---

# 77. Mandatory after-change review

Before finishing any TypeScript change, inspect the diff.

For every added helper, type, branch, fallback, cast, or runtime check, ask:

1. Does this handle a state that can genuinely occur?
2. Is this compensating for bad typing upstream?
3. Could the type system express this instead?
4. Did I add more code than the problem requires?
5. Did I introduce a helper with only one trivial caller?
6. Did I replace a direct operation with an abstraction?
7. Did I silently convert invalid input into an empty value?
8. Did I make the code harder to trace?
9. Did this change increase total complexity?
10. Can any newly added code be deleted while preserving correctness?

If yes, simplify before completing the task.

---

# 78. Final anti-slop rule

Do not transform:

```txt
simple typed value
→ direct operation
```

into:

```txt
unknown
→ runtime narrowing
→ Record<string, unknown>
→ extractor
→ normalizer
→ fallback
→ helper
→ actual operation
```

The desired flow is:

```txt
untrusted input
→ validate once
→ precise type
→ direct business logic
```

The overriding principle is:

> **Make external input safe at the edge. Keep internal TypeScript simple, direct, and strongly typed.**

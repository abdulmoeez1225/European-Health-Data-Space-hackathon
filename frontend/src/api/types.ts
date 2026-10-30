import type { components } from "./schema";

type Schemas = components["schemas"];

export type RequestResult = Schemas["RequestResult"];
export type Decision = RequestResult["decision"];
export type RequestStatus = RequestResult["status"];
export type PurposeAssessment = Schemas["PurposeAssessment"];
export type ProhibitedGround = PurposeAssessment["prohibited_ground"];
export type StatisticsOutput = Schemas["StatisticsOutput"];
export type ReleasedRow = Schemas["ReleasedRow"];
export type ReleasedCell = Schemas["ReleasedCell"];
export type CellValue = ReleasedCell["shown"];
export type PrivacyCheck = Schemas["PrivacyCheck"];
export type SpeOutput = Schemas["SpeOutput"];
export type CodeMapping = Schemas["CodeMapping"];
export type ReviewFlag = Schemas["ReviewFlag"];
export type QueryPlan = Schemas["QueryPlan"];
export type Timings = Schemas["Timings"];
export type Consensus = Schemas["Consensus"];
export type SpeInfo = Schemas["SpeInfo"];
export type SpeTable = Schemas["SpeTable"];
export type QueryResult = Schemas["QueryResult"];
export type AirlockResult = Schemas["AirlockResult"];
export type AuditEvent = Schemas["AuditEvent"];
export type AuditPage = Schemas["AuditPage"];
export type StaffAction = Schemas["StaffAction"];
export type Appeal = Schemas["Appeal"];
export type LedgerEvent = Schemas["LedgerEvent"];
export type SqlBody = Schemas["SqlBody"];

/** The backend types request bodies and samples as free-form objects (see backend/api.py). */
export type JsonObject = Record<string, unknown>;

/** One SQL result cell as returned by DuckDB through FastAPI. */
export type ResultValue = string | number | boolean | null;
export type Article = Schemas["Article"];
export type LawResponse = Schemas["LawResponse"];
export type Health = Schemas["Health"];
export type DownloadBlocked = Schemas["DownloadBlocked"];
export type LedgerResetResult = Schemas["LedgerResetResult"];

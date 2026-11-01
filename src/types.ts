export type DateType =
  | 'abstract_deadline'
  | 'full_paper_deadline'
  | 'application_deadline'
  | 'registration_closes'
  | 'submission_deadline'
  | 'proposal_deadline'
  | 'notification_date'
  | 'event_dates'
  | 'window_start';

export const DATE_TYPES: DateType[] = [
  'abstract_deadline',
  'full_paper_deadline',
  'application_deadline',
  'registration_closes',
  'submission_deadline',
  'proposal_deadline',
  'notification_date',
  'event_dates',
  'window_start',
];

export type Flag =
  | 'no_timezone'
  | 'year_inferred'
  | 'already_passed'
  | 'phrase_not_found'
  | 'date_mismatch'
  | 'llm_date_unverified'
  | 'bad_order';

export interface ExtractedDate {
  id: string;
  type: DateType;
  /** Human label used in the event title, for example "Application window". */
  label: string;
  /** Deadline or end date, YYYY-MM-DD. */
  date: string;
  /** 24h HH:mm, or null when the page gives no time. */
  time: string | null;
  /** IANA id, "AoE", "UTC", "UTC+02:00", or null when unknown. */
  tz: string | null;
  /** Window start date, set when the opportunity has a period. */
  startDate: string | null;
  startTime: string | null;
  /** The source text the date came from. */
  rawPhrase: string;
  startPhrase?: string;
  source: 'parser' | 'llm';
  flags: Flag[];
  selected: boolean;
}

export interface PageSnapshot {
  url: string;
  finalUrl: string;
  title: string;
  ogTitle: string;
  h1: string;
  description: string;
  siteName: string;
  text: string;
}

export interface ExtractionResult {
  name: string;
  titleSource: string;
  finalUrl: string;
  dates: ExtractedDate[];
  pageTz: string | null;
  usedLlm: boolean;
  llmProvider?: string;
  notes: string[];
}

export type RecordStatus =
  | 'extracting'
  | 'pending'
  | 'sending'
  | 'sent'
  | 'queued'
  | 'failed'
  | 'cancelled'
  | 'error';

export interface DeliveryInfo {
  eventId: string;
  requestId: string;
  sentAt: string;
  hash: string;
}

export interface CaptivumRecord {
  id: string;
  url: string;
  finalUrl: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: RecordStatus;
  error?: string;
  errorCode?: string;
  attempts: number;
  nextRetryAt?: string;
  dates: ExtractedDate[];
  delivered: Record<string, DeliveryInfo>;
  notes: string[];
  usedLlm: boolean;
}

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  jsonMode: 'json_schema' | 'json_object' | 'none';
  enabled: boolean;
}

export interface Settings {
  scriptUrl: string;
  scriptSecret: string;
  /** Informational. The script is the authority on who sends. */
  senderEmail: string;
  receiverEmail: string;
  defaultTz: string;
  llmEnabled: boolean;
  providers: Provider[];
}

export interface Counters {
  day: string;
  invitesToday: number;
  totalInvites: number;
  llmToday: Record<string, number>;
  llmFailedToday: number;
  scriptLeft: number | null;
}

export interface EventPayload {
  requestId: string;
  title: string;
  description: string;
  allDay: boolean;
  /** All-day events: first day. */
  startDate?: string;
  /** All-day events: day after the last day (exclusive, as Google expects). */
  endDate?: string;
  /** Timed events: ISO 8601 in UTC. */
  startDateTime?: string;
  endDateTime?: string;
  sourceUrl: string;
}

export type Msg =
  | { type: 'extract'; input: string }
  | { type: 'saveDraft'; id: string; name: string; dates: ExtractedDate[] }
  | { type: 'deliver'; id: string }
  | { type: 'reopen'; id: string }
  | { type: 'cancelInvites'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'scriptTest'; sendInvite: boolean }
  | { type: 'cancelTestInvite'; eventId: string }
  | { type: 'llmTest'; providerId: string }
  | { type: 'retryNow' };

export type Reply = { ok: true; [k: string]: unknown } | { ok: false; error: string; code?: string; [k: string]: unknown };

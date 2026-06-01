/**
 * Signal Engine types (design "Signal Engine", Requirements 16, 17).
 *
 * Each detected signal carries the group of the rule that produced it and a
 * fixed severity, plus a navigation target the Signal Center uses to jump to
 * the referenced page/entity (Req 16.5).
 */

/** Fixed severity levels assigned by the detection rules (Req 17.6). */
export type Severity = 'informational' | 'warning' | 'critical';

/** The five signal categories surfaced in the Signal Center (Req 16.2). */
export type SignalGroup =
  | 'high_spend'
  | 'low_balance'
  | 'api_key_anomaly'
  | 'response_time_anomaly'
  | 'risk_hint';

/** Where selecting a signal navigates to (Req 16.5). */
export interface SignalTarget {
  page: string;
  entityId: string;
}

/** A single detected alert, anomaly, or risk hint. */
export interface Signal {
  id: string;
  group: SignalGroup;
  severity: Severity;
  message: string;
  target: SignalTarget;
  read: boolean;
}

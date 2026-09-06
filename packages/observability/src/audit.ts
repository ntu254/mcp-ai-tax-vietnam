import { AuditEvent } from "@vietnam-tax/common";
import { logger } from "./logger.js";

export interface CreateAuditOptions {
  eventName: string;
  entityType: string;
  entityId?: string | null;
  actor: string;
  details?: Record<string, unknown> | null;
}

export function buildAuditEvent(options: CreateAuditOptions): AuditEvent {
  const event: AuditEvent = {
    id: crypto.randomUUID(),
    event_name: options.eventName,
    entity_type: options.entityType,
    entity_id: options.entityId ?? null,
    actor: options.actor,
    details: options.details ?? null,
    created_at: new Date(),
  };

  logger.info(
    {
      audit: true,
      audit_event_id: event.id,
      event_name: event.event_name,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      actor: event.actor,
    },
    `Audit event: ${event.event_name} on ${event.entity_type} by ${event.actor}`
  );

  return event;
}

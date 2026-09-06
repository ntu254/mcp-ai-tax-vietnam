import { McpErrorCode, McpErrorPayload } from "./contract.js";

export class LegalDomainError extends Error {
  public readonly code: McpErrorCode;
  public readonly retryable: boolean;
  public readonly documentId?: string;
  public readonly evidence: unknown[];

  constructor(options: {
    code: McpErrorCode;
    message: string;
    retryable?: boolean;
    documentId?: string;
    evidence?: unknown[];
  }) {
    super(options.message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.documentId = options.documentId;
    this.evidence = options.evidence ?? [];
  }

  toMcpPayload(): McpErrorPayload {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      document_id: this.documentId,
      evidence: this.evidence,
    };
  }
}

export class DocumentNotFoundError extends LegalDomainError {
  constructor(documentId: string, message?: string) {
    super({
      code: "DOCUMENT_NOT_FOUND",
      message: message ?? `Document not found with identifier: ${documentId}`,
      retryable: false,
      documentId,
    });
  }
}

export class InsufficientEvidenceError extends LegalDomainError {
  constructor(message: string, documentId?: string, evidence: unknown[] = []) {
    super({
      code: "INSUFFICIENT_EVIDENCE",
      message,
      retryable: false,
      documentId,
      evidence,
    });
  }
}

export class LegalStatusConflictError extends LegalDomainError {
  constructor(message: string, documentId?: string, evidence: unknown[] = []) {
    super({
      code: "LEGAL_STATUS_CONFLICT",
      message:
        message ?? "Official sources disagree on a material legal fact.",
      retryable: false,
      documentId,
      evidence,
    });
  }
}

export class LegalStatusUnknownError extends LegalDomainError {
  constructor(documentId: string, message?: string) {
    super({
      code: "LEGAL_STATUS_UNKNOWN",
      message:
        message ?? `Unable to resolve legal status for document: ${documentId}`,
      retryable: false,
      documentId,
    });
  }
}

export class SourceUnavailableError extends LegalDomainError {
  constructor(sourceName: string, detail?: string) {
    super({
      code: "SOURCE_UNAVAILABLE",
      message: `Official legal source unavailable: ${sourceName}${detail ? ` (${detail})` : ""}`,
      retryable: true,
    });
  }
}

export class ParserFailureError extends LegalDomainError {
  constructor(message: string, documentId?: string) {
    super({
      code: "PARSER_FAILED",
      message,
      retryable: false,
      documentId,
    });
  }
}

export class VerificationPendingError extends LegalDomainError {
  constructor(documentId: string) {
    super({
      code: "VERIFICATION_PENDING",
      message: `Document ${documentId} verification is currently pending.`,
      retryable: true,
      documentId,
    });
  }
}

export class DocumentIdentityUnresolvedError extends LegalDomainError {
  constructor(documentNumber: string, message?: string) {
    super({
      code: "DOCUMENT_IDENTITY_UNRESOLVED",
      message:
        message ??
        `Document identity unresolved for candidate number: ${documentNumber}`,
      retryable: false,
    });
  }
}

export class LegalDomainError extends Error {
    code;
    retryable;
    documentId;
    evidence;
    constructor(options) {
        super(options.message);
        this.name = this.constructor.name;
        this.code = options.code;
        this.retryable = options.retryable ?? false;
        this.documentId = options.documentId;
        this.evidence = options.evidence ?? [];
    }
    toMcpPayload() {
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
    constructor(documentId, message) {
        super({
            code: "DOCUMENT_NOT_FOUND",
            message: message ?? `Document not found with identifier: ${documentId}`,
            retryable: false,
            documentId,
        });
    }
}
export class InsufficientEvidenceError extends LegalDomainError {
    constructor(message, documentId, evidence = []) {
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
    constructor(message, documentId, evidence = []) {
        super({
            code: "LEGAL_STATUS_CONFLICT",
            message: message ?? "Official sources disagree on a material legal fact.",
            retryable: false,
            documentId,
            evidence,
        });
    }
}
export class LegalStatusUnknownError extends LegalDomainError {
    constructor(documentId, message) {
        super({
            code: "LEGAL_STATUS_UNKNOWN",
            message: message ?? `Unable to resolve legal status for document: ${documentId}`,
            retryable: false,
            documentId,
        });
    }
}
export class SourceUnavailableError extends LegalDomainError {
    constructor(sourceName, detail) {
        super({
            code: "SOURCE_UNAVAILABLE",
            message: `Official legal source unavailable: ${sourceName}${detail ? ` (${detail})` : ""}`,
            retryable: true,
        });
    }
}
export class ParserFailureError extends LegalDomainError {
    constructor(message, documentId) {
        super({
            code: "PARSER_FAILED",
            message,
            retryable: false,
            documentId,
        });
    }
}
export class VerificationPendingError extends LegalDomainError {
    constructor(documentId) {
        super({
            code: "VERIFICATION_PENDING",
            message: `Document ${documentId} verification is currently pending.`,
            retryable: true,
            documentId,
        });
    }
}
export class DocumentIdentityUnresolvedError extends LegalDomainError {
    constructor(documentNumber, message) {
        super({
            code: "DOCUMENT_IDENTITY_UNRESOLVED",
            message: message ??
                `Document identity unresolved for candidate number: ${documentNumber}`,
            retryable: false,
        });
    }
}
//# sourceMappingURL=errors.js.map
import { McpErrorCode, McpErrorPayload } from "./contract.js";
export declare class LegalDomainError extends Error {
    readonly code: McpErrorCode;
    readonly retryable: boolean;
    readonly documentId?: string;
    readonly evidence: unknown[];
    constructor(options: {
        code: McpErrorCode;
        message: string;
        retryable?: boolean;
        documentId?: string;
        evidence?: unknown[];
    });
    toMcpPayload(): McpErrorPayload;
}
export declare class DocumentNotFoundError extends LegalDomainError {
    constructor(documentId: string, message?: string);
}
export declare class InsufficientEvidenceError extends LegalDomainError {
    constructor(message: string, documentId?: string, evidence?: unknown[]);
}
export declare class LegalStatusConflictError extends LegalDomainError {
    constructor(message: string, documentId?: string, evidence?: unknown[]);
}
export declare class LegalStatusUnknownError extends LegalDomainError {
    constructor(documentId: string, message?: string);
}
export declare class SourceUnavailableError extends LegalDomainError {
    constructor(sourceName: string, detail?: string);
}
export declare class ParserFailureError extends LegalDomainError {
    constructor(message: string, documentId?: string);
}
export declare class VerificationPendingError extends LegalDomainError {
    constructor(documentId: string);
}
export declare class DocumentIdentityUnresolvedError extends LegalDomainError {
    constructor(documentNumber: string, message?: string);
}
//# sourceMappingURL=errors.d.ts.map
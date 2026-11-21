/** Antarmuka publik modul conversations-messages. */
export { onCustomerMessage, emitCustomerMessage, automationEligible, AUTOMATION_MAX_AGE_MS, type CustomerMessageEvent } from "./events";
export { evaluateWindow, provenCustomerTime, WINDOW_MS, type WindowState } from "./window";
export { deriveStatus, applyStatusesToMessage, recordStatusEvent, PROVIDER_STATUS, type MessageStatus } from "./status";
export { ingestEvent, type IngestOutcome } from "./ingest";
export { processInboundBatch, kickProcessing, runMaintenance, type BatchResult } from "./worker";
export { sendOutbound, classifyFailure, type SendInput, type SendResult } from "./send";
export { reconcileUncertain, expireStaleProcessing, processingStaleMs, resolveUncertainManually } from "./reconcile";
export { fetchInboundMedia, readMediaForUser, retryPendingMedia, sniffMime, MEDIA_LIMITS, ALLOWED_MIME } from "./media";
export { addRecipient, removeRecipient, listRecipients, resolveRecipientId, isListedRecipient, normalizeIdentity, maskIdentity } from "./recipients";
export { getOverview, listProblemEvents, retryEvent, listToolChannels } from "./tool";
export { conversationAccessSql, getConversationForAction, canAccessConversation, permittedChannelIds, resetAccessCacheForTests, ACTION_PERMISSION, type ConvAction } from "./access";
export { evaluateEligibility, type EligibilityResult } from "./eligibility";
export { setAiState, AI_OFF_REASONS, AI_OFF_LABEL, type AiChange, type AiState, type AiOffReason, type AiActor } from "./ai-state";
export { dispatchOutbox, enqueueCustomerMessage } from "./outbox";
export { executeSend, validateSendInput, byKey, asResult, safeName, type ExecuteSendInput, type SendActor } from "./send";
export { recipientAllowed } from "./recipients";

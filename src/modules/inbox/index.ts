/** Antarmuka publik modul inbox (Tahap 3). */
export { listConversations, inboxNav, inboxChanges, markRead, getConversationDetail, listConversationMessages, type ListFilters, type ListItem } from "./list";
export { replyToConversation, addNote, aiAction, assignConversation, transferConversation, setStrayLead, clearReview, type ReplyInput, type AiActionName } from "./actions";
export { listQuickReplies, createQuickReply, updateQuickReply, quickRepliesForConversation, QUICK_REPLY_VARIABLES, renderTemplate, validateTemplate } from "./quick-replies";

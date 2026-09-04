export type { TokenStorage } from "./storage";
export { createApiClient, initApi, getApi, type ApiClientOptions } from "./client";
export { buildEventsUrl } from "./sse";

// Resource modules, namespaced to avoid name collisions between resources.
export * as authApi from "./resources/auth";
export * as attendanceApi from "./resources/attendance";
export * as availabilityApi from "./resources/availability";
export * as calendarApi from "./resources/calendar";
export * as classesApi from "./resources/classes";
export * as coachLevelApi from "./resources/coachLevel";
export * as dashboardApi from "./resources/dashboard";
export * as evaluationApi from "./resources/evaluation";
export * as fieldsApi from "./resources/fields";
export * as invitationsApi from "./resources/invitations";
export * as messagesApi from "./resources/messages";
export * as notificationEngineApi from "./resources/notificationEngine";
export * as playerInvitationsApi from "./resources/playerInvitations";
export * as playersApi from "./resources/players";
export * as presencesApi from "./resources/presences";
export * as registerApi from "./resources/register";
export * as seasonsApi from "./resources/seasons";
export * as trainingApi from "./resources/training";
export * as usersApi from "./resources/users";

// How often a screen asks the API again while it is open and visible, so what other people do
// (a request sent, an approval, a balance change) shows up without pressing F5. Clients never
// listen to Firestore here (the rules deny everything), so "live" means polling the API.
// Every tick of a list costs one Firestore read per document in it: raise this before adding
// more polled resources.
export const LIVE_REFRESH_MS = 30_000;

// Requests are what people wait on (a collaborator sent one, an admin must answer), and their
// lists are short (the pending inbox, one person's own requests), so they refresh faster
export const INBOX_REFRESH_MS = 10_000;
export const OWN_REQUESTS_REFRESH_MS = 15_000;

// Minimum time between two background refreshes of the same resource, so a burst of
// focus/visibility events (alt-tab, switching windows) does not fire one request each
export const MIN_REFRESH_GAP_MS = 5_000;

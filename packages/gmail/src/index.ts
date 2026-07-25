export {
  registerWatch,
  storeWatchRegistration,
  stopWatch,
  getExpiringWatches,
  type WatchResponse,
} from './watch.js';

export {
  fetchHistoryChanges,
  fetchRecentMessages,
  fetchMessage,
  storeMessage,
  updateSyncState,
  type GmailMessage,
} from './history.js';

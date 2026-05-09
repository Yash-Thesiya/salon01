// Storage Management
const Storage = {
    KEYS: {
        QUEUE: 'sz_queue',
        DAILY_COUNT: 'sz_daily_count',
    DATE: 'sz_date',
    QUEUE_EVENT: 'sz_queue_event' // used for same-tab signaling
    },

  channel: null,

  initChannel() {
    // BroadcastChannel is supported in modern Chromium/Firefox and works in same-tab too.
    // We keep it optional and always fall back to `storage` events between tabs.
    if (this.channel) return;
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('sz_queue_channel');
    }
  },

  emitQueueChanged(reason = 'queue_updated') {
    // Same-tab: CustomEvent + localStorage "event key" nudge.
    // Cross-tab: `storage` event (from QUEUE key) + BroadcastChannel (when available).
    try {
      window.dispatchEvent(new CustomEvent('sz:queue_changed', { detail: { reason, at: Date.now() } }));
    } catch (_) {
      // ignore
    }

    try {
      localStorage.setItem(this.KEYS.QUEUE_EVENT, JSON.stringify({ reason, at: Date.now() }));
    } catch (_) {
      // ignore
    }

    this.initChannel();
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'queue_changed', reason, at: Date.now() });
      } catch (_) {
        // ignore
      }
    }
  },

    // Initialize storage and check for midnight reset
    init() {
        const today = new Date().toDateString();
        const storedDate = localStorage.getItem(this.KEYS.DATE);

        if (storedDate !== today) {
            this.clearData();
            localStorage.setItem(this.KEYS.DATE, today);
        }
    },

    getData() {
        const data = localStorage.getItem(this.KEYS.QUEUE);
        return data ? JSON.parse(data) : [];
    },

    saveData(queueArray) {
        localStorage.setItem(this.KEYS.QUEUE, JSON.stringify(queueArray));
    this.emitQueueChanged('queue_saved');
    },

    getDailyCount() {
        const count = localStorage.getItem(this.KEYS.DAILY_COUNT);
        return count ? parseInt(count, 10) : 0;
    },

    incrementDailyCount() {
        const current = this.getDailyCount();
        const newCount = current + 1;
        localStorage.setItem(this.KEYS.DAILY_COUNT, newCount.toString());
        return newCount;
    },

    clearData() {
        localStorage.setItem(this.KEYS.QUEUE, JSON.stringify([]));
        localStorage.setItem(this.KEYS.DAILY_COUNT, '0');
    this.emitQueueChanged('queue_cleared');
    }
};

// Initialize on load
Storage.init();
Storage.initChannel();

// Firestore-backed storage management
const Storage = {
    queueStateDocPath: 'salon/state',
    db: null,
    docRef: null,
    queueCache: [],
    dailyCountCache: 0,
    dateCache: '',
    listeners: new Set(),
    unsubscribeSnapshot: null,

    init() {
        if (!window.firebase || !firebase.firestore) {
            throw new Error('Firebase Firestore SDK is not available.');
        }

        this.db = firebase.firestore();
        this.docRef = this.db.doc(this.queueStateDocPath);
        this.attachRealtimeListener();
        this.ensureInitializedDocument();
    },

    todayString() {
        return new Date().toDateString();
    },

    cloneQueue(queueArray) {
        return JSON.parse(JSON.stringify(queueArray || []));
    },

    notifyQueueChanged(reason = 'queue_updated') {
        const eventPayload = { reason, at: Date.now() };

        this.listeners.forEach((listener) => {
            try {
                listener(eventPayload);
            } catch (_) {
                // ignore listener errors
            }
        });

        try {
            window.dispatchEvent(new CustomEvent('sz:queue_changed', { detail: eventPayload }));
        } catch (_) {
            // ignore browser event errors
        }
    },

    subscribeQueue(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }

        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    },

    applyRemoteState(data) {
        this.queueCache = this.cloneQueue(data.queue || []);
        this.dailyCountCache = Number.isFinite(data.dailyCount) ? data.dailyCount : 0;
        this.dateCache = data.date || this.todayString();
    },

    ensureInitializedDocument() {
        const today = this.todayString();
        this.docRef.get().then((snap) => {
            if (!snap.exists) {
                this.writeState({
                    queue: [],
                    dailyCount: 0,
                    date: today
                });
                return;
            }

            const data = snap.data() || {};
            if (data.date !== today) {
                this.writeState({
                    queue: [],
                    dailyCount: 0,
                    date: today
                });
            }
        }).catch((error) => {
            console.error('Failed to initialize Firestore queue document:', error);
        });
    },

    attachRealtimeListener() {
        if (this.unsubscribeSnapshot) {
            this.unsubscribeSnapshot();
        }

        this.unsubscribeSnapshot = this.docRef.onSnapshot((snap) => {
            if (!snap.exists) {
                return;
            }

            const data = snap.data() || {};
            const today = this.todayString();

            if (data.date && data.date !== today) {
                this.writeState({
                    queue: [],
                    dailyCount: 0,
                    date: today
                });
                return;
            }

            this.applyRemoteState(data);
            this.notifyQueueChanged('firestore_snapshot');
        }, (error) => {
            console.error('Firestore realtime listener error:', error);
        });
    },

    writeState(partialState) {
        if (!this.docRef) return;

        this.docRef.set({
            queue: partialState.queue !== undefined ? partialState.queue : this.queueCache,
            dailyCount: partialState.dailyCount !== undefined ? partialState.dailyCount : this.dailyCountCache,
            date: partialState.date !== undefined ? partialState.date : this.dateCache || this.todayString(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch((error) => {
            console.error('Failed to write Firestore queue state:', error);
        });
    },

    getData() {
        return this.cloneQueue(this.queueCache);
    },

    saveData(queueArray) {
        this.queueCache = this.cloneQueue(queueArray);
        this.dateCache = this.dateCache || this.todayString();
        this.writeState({ queue: this.queueCache, date: this.dateCache });
        this.notifyQueueChanged('queue_saved');
    },

    getDailyCount() {
        return this.dailyCountCache || 0;
    },

    incrementDailyCount() {
        const today = this.todayString();
        if (this.dateCache !== today) {
            this.queueCache = [];
            this.dailyCountCache = 0;
            this.dateCache = today;
        }

        this.dailyCountCache += 1;
        this.writeState({
            dailyCount: this.dailyCountCache,
            date: this.dateCache
        });
        return this.dailyCountCache;
    },

    clearData() {
        this.queueCache = [];
        this.dailyCountCache = 0;
        this.dateCache = this.todayString();
        this.writeState({
            queue: [],
            dailyCount: 0,
            date: this.dateCache
        });
        this.notifyQueueChanged('queue_cleared');
    }
};

Storage.init();

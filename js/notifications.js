// Browser Push Notifications
const NotifSys = {
    supported: 'Notification' in window,
    myTurnUnsubscribe: null,
    myTurnToken: null,

    async requestPermission() {
        if (!this.supported) return false;
        if (Notification.permission === 'granted') return true;
        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
        return false;
    },

    hasPermission() {
        return this.supported && Notification.permission === 'granted';
    },

    sendNotification(title, body) {
        if (this.hasPermission()) {
            try {
                new Notification(title, {
                    body: body,
                    icon: '/favicon.ico',
                    requireInteraction: true
                });
            } catch (e) {
                console.log('Notification error', e);
            }
        }
    },

    stopMyTurnListener() {
        if (typeof this.myTurnUnsubscribe === 'function') {
            this.myTurnUnsubscribe();
        }
        this.myTurnUnsubscribe = null;
        this.myTurnToken = null;
        this.updateDebugPanel({ token: null, status: 'idle', time: new Date().toLocaleTimeString() });
    },

    listenForMyTurn(myTokenNumber) {
        const tokenNumber = parseInt(myTokenNumber, 10);
        if (!Number.isFinite(tokenNumber)) return;

        // ✅ FIX 1: Pehle stop karo existing listener
        this.stopMyTurnListener();
        this.myTurnToken = tokenNumber;

        console.log('✅ Listener started for token:', tokenNumber);
        this.updateDebugPanel({ token: tokenNumber, status: 'listening...', time: new Date().toLocaleTimeString() });

        if (!window.firebase || !firebase.firestore) {
            console.log('❌ Firebase not available');
            return;
        }

        const db = firebase.firestore();
        // ✅ FIX 2: Same path jo storage.js use karta hai
        const docRef = db.doc('salon/state');

        this.myTurnUnsubscribe = docRef.onSnapshot((doc) => {
            if (!doc.exists) {
                console.log('❌ Document does not exist');
                return;
            }

            const payload = doc.data() || {};
            const queue = Array.isArray(payload.queue) ? payload.queue : [];

            // ✅ FIX 3: Token ko NUMBER se compare karo
            const myEntry = queue.find((item) => Number(item.token) === tokenNumber);

            console.log('🔥 Firebase snapshot received. My entry:', myEntry);

            this.updateDebugPanel({
                token: tokenNumber,
                status: myEntry ? myEntry.status : 'not found in queue',
                time: new Date().toLocaleTimeString()
            });

            if (!myEntry) {
                console.log('⚠️ My token not found in queue');
                return;
            }

            console.log('📌 My status:', myEntry.status);

            // ✅ FIX 4: calledAt key alag rakho — app.js se clash na ho
            if (myEntry.status === 'called') {
                const calledAt = myEntry.calledAt || 0;
                // ✅ FIX 5: Unique key use karo — app.js ki key se alag
                const seenKey = `sz_notif_seen_${tokenNumber}`;
                const lastSeen = sessionStorage.getItem(seenKey);

                console.log('🔔 Called! calledAt:', calledAt, 'lastSeen:', lastSeen);

                if (String(calledAt) !== lastSeen) {
                    sessionStorage.setItem(seenKey, String(calledAt));
                    console.log('🚨 Showing full screen alert!');

                    // ✅ FIX 6: Thoda delay do taaki DOM ready ho
                    setTimeout(() => {
                        this.showFullScreenAlert(tokenNumber);
                        this.playBeepSound();
                        this.sendNotification("It's Your Turn!", `Token #${tokenNumber} — Please come to the salon now.`);
                    }, 300);
                } else {
                    console.log('ℹ️ Alert already shown for this calledAt');
                }
            }

            // ✅ FIX 7: Position calculate karo sirf waiting walo mein
            const waitingLine = queue
                .filter((item) => item.status === 'waiting')
                .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

            const position = waitingLine.findIndex((item) => Number(item.token) === tokenNumber);

            if (position === 0 && myEntry.status === 'waiting') {
                // Aap next hain
                this.showComingSoonBanner();
            }

        }, (error) => {
            console.log('❌ Listener error:', error);
            this.updateDebugPanel({ token: tokenNumber, status: 'ERROR: ' + error.message, time: new Date().toLocaleTimeString() });
        });
    },

    showFullScreenAlert(tokenNumber) {
        // ✅ FIX 8: Pehle called-popup bhi hatao
        const calledPopup = document.getElementById('called-popup');
        if (calledPopup) calledPopup.classList.add('hidden');

        const existing = document.getElementById('my-turn-fullscreen-alert');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'my-turn-fullscreen-alert';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 99999;
            background: #c8963e;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
        `;

        overlay.innerHTML = `
            <div style="
                text-align: center;
                max-width: 420px;
                background: #fff8e6;
                border-radius: 24px;
                padding: 36px 28px;
                box-shadow: 0 8px 40px rgba(0,0,0,0.25);
            ">
                <div style="font-size: 64px; margin-bottom: 12px;">✂️</div>
                <h1 style="
                    margin: 0 0 8px;
                    font-size: 40px;
                    color: #111;
                    font-weight: 800;
                ">Your Turn!</h1>
                <div style="
                    font-size: 64px;
                    font-weight: 900;
                    color: #c8963e;
                    margin: 8px 0;
                ">
                    #${tokenNumber}
                </div>
                <p style="
                    font-size: 18px;
                    color: #444;
                    margin: 0 0 28px;
                ">
                    Please come to the salon now
                </p>
                <button
                    id="dismiss-my-turn-alert"
                    style="
                        border: none;
                        background: #111;
                        color: #fff;
                        padding: 14px 32px;
                        border-radius: 50px;
                        font-size: 18px;
                        cursor: pointer;
                        font-weight: 600;
                    "
                >
                    ✅ OK, Coming!
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        const dismissBtn = document.getElementById('dismiss-my-turn-alert');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => overlay.remove());
        }

        // ✅ Auto dismiss after 60 seconds
        setTimeout(() => {
            if (document.getElementById('my-turn-fullscreen-alert')) {
                overlay.remove();
            }
        }, 60000);
    },

    playBeepSound() {
        try {
            const audio = new Audio('assets/notify.mp3');
            audio.volume = 0.8;
            audio.play().catch(e => console.log('Audio error:', e));
        } catch (e) {
            console.log('Audio error:', e);
        }
    },

    showComingSoonBanner() {
        let banner = document.getElementById('coming-soon-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'coming-soon-banner';
            banner.textContent = '⚠️ You are next! Please start coming to the salon.';
            banner.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0;
                z-index: 9998;
                background: #ffd84d;
                color: #111;
                padding: 12px 16px;
                text-align: center;
                font-weight: 700;
                font-size: 15px;
            `;
            document.body.appendChild(banner);
        }

        clearTimeout(this._comingSoonTimer);
        this._comingSoonTimer = setTimeout(() => {
            const b = document.getElementById('coming-soon-banner');
            if (b) b.remove();
        }, 30000);
    },

    updateDebugPanel({ token, status, time }) {
        const tokenEl = document.getElementById('debug-token');
        const timeEl = document.getElementById('debug-last-update');
        const statusEl = document.getElementById('debug-status');

        if (tokenEl) tokenEl.textContent = token ? `#${token}` : '-';
        if (timeEl) timeEl.textContent = time || '-';
        if (statusEl) statusEl.textContent = status || '-';
    }
};

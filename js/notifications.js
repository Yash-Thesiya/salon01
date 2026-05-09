// Browser Push Notifications
const NotifSys = {
    supported: 'Notification' in window,
    myTurnUnsubscribe: null,
    myTurnToken: null,

    async requestPermission() {
        if (!this.supported) return false;
        
        if (Notification.permission === 'granted') {
            return true;
        }
        
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
                    icon: '/favicon.ico', // fallback icon
                    vibrate: [200, 100, 200]
                });
            } catch (e) {
                console.log("Notification error", e);
            }
        }
    },

    stopMyTurnListener() {
        if (typeof this.myTurnUnsubscribe === 'function') {
            this.myTurnUnsubscribe();
        }
        this.myTurnUnsubscribe = null;
        this.myTurnToken = null;
        this.updateDebugPanel({
            token: null,
            status: 'idle',
            time: new Date().toLocaleTimeString()
        });
    },

    listenForMyTurn(myTokenNumber) {
        const tokenNumber = parseInt(myTokenNumber, 10);
        if (!Number.isFinite(tokenNumber)) return;

        this.stopMyTurnListener();
        this.myTurnToken = tokenNumber;
        console.log('Listener started for token:', tokenNumber);
        this.updateDebugPanel({
            token: tokenNumber,
            status: 'listening',
            time: new Date().toLocaleTimeString()
        });

        if (!window.firebase || !firebase.firestore) {
            console.log('Firebase not available for listener');
            return;
        }

        const db = firebase.firestore();
        const docRef = db.doc('salon/state');

        this.myTurnUnsubscribe = docRef.onSnapshot((doc) => {
            const payload = doc.exists ? (doc.data() || {}) : {};
            const queue = Array.isArray(payload.queue) ? payload.queue : [];
            const myEntry = queue.find((item) => Number(item.token) === tokenNumber);
            const waitingLine = queue
                .filter((item) => item.status === 'waiting' || item.status === 'called')
                .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
            const position = myEntry ? waitingLine.findIndex((item) => Number(item.token) === tokenNumber) : -1;

            console.log('Firebase snapshot received:', myEntry);
            console.log('Status is:', myEntry ? myEntry.status : 'not_found');

            this.updateDebugPanel({
                token: tokenNumber,
                status: myEntry ? myEntry.status : 'not_found',
                time: new Date().toLocaleTimeString()
            });

            if (!myEntry) return;

            if (myEntry.status === 'called') {
                const calledAt = myEntry.calledAt || Date.now();
                const seenKey = `sz_called_alert_token_${tokenNumber}`;
                const lastSeen = sessionStorage.getItem(seenKey);

                if (lastSeen !== String(calledAt)) {
                    sessionStorage.setItem(seenKey, String(calledAt));
                    console.log('Showing alert now!');
                    this.showFullScreenAlert(tokenNumber);
                    this.playBeepSound();
                }
            }

            if (position === 1) {
                this.showComingSoonBanner();
            }
        }, (error) => {
            console.log('Listener error:', error);
            this.updateDebugPanel({
                token: tokenNumber,
                status: 'error',
                time: new Date().toLocaleTimeString()
            });
        });
    },

    showFullScreenAlert(tokenNumber) {
        const existing = document.getElementById('my-turn-fullscreen-alert');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'my-turn-fullscreen-alert';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = '9999';
        overlay.style.background = '#c8963e';
        overlay.style.color = '#111';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '24px';

        overlay.innerHTML = `
            <div style="text-align:center; max-width:520px; background:#fff8e6; border-radius:20px; padding:28px;">
                <h1 style="margin:0 0 12px; font-size:44px; line-height:1.1;">Your Turn!</h1>
                <div style="font-size:56px; font-weight:800; margin-bottom:10px;">Token #${tokenNumber}</div>
                <p style="font-size:20px; margin:0 0 20px;">Please come to salon now</p>
                <button id="dismiss-my-turn-alert" style="border:none; background:#111; color:#fff; padding:12px 24px; border-radius:12px; font-size:18px; cursor:pointer;">OK</button>
            </div>
        `;

        document.body.appendChild(overlay);
        const dismissBtn = document.getElementById('dismiss-my-turn-alert');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => overlay.remove());
        }
    },

    playBeepSound() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        const context = new AudioCtx();
        const beepDuration = 180;
        const gap = 140;

        for (let i = 0; i < 3; i += 1) {
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.type = 'sine';
            osc.frequency.value = 800;
            osc.connect(gain);
            gain.connect(context.destination);

            const startTime = context.currentTime + (i * (beepDuration + gap)) / 1000;
            const endTime = startTime + beepDuration / 1000;
            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
            osc.start(startTime);
            osc.stop(endTime);
        }
    },

    showComingSoonBanner() {
        let banner = document.getElementById('coming-soon-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'coming-soon-banner';
            banner.textContent = '1 person ahead of you - please start coming';
            banner.style.position = 'fixed';
            banner.style.top = '0';
            banner.style.left = '0';
            banner.style.right = '0';
            banner.style.zIndex = '9998';
            banner.style.background = '#ffd84d';
            banner.style.color = '#111';
            banner.style.padding = '10px 12px';
            banner.style.textAlign = 'center';
            banner.style.fontWeight = '700';
            document.body.appendChild(banner);
        }

        clearTimeout(this._comingSoonTimer);
        this._comingSoonTimer = setTimeout(() => {
            const existing = document.getElementById('coming-soon-banner');
            if (existing) existing.remove();
        }, 6000);
    },

    updateDebugPanel({ token, status, time }) {
        const panel = document.getElementById('firebase-debug-panel');
        if (!panel) return;

        const tokenEl = document.getElementById('debug-token');
        const timeEl = document.getElementById('debug-last-update');
        const statusEl = document.getElementById('debug-status');

        if (tokenEl) tokenEl.textContent = token ? `#${token}` : '-';
        if (timeEl) timeEl.textContent = time || '-';
        if (statusEl) statusEl.textContent = status || '-';
    }
};

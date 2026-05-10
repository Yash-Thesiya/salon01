// Main App Logic
const App = {
    unsubscribeQueueSync: null,
    myCustomerId: null,

    init() {
        // ✅ FIX 1: Storage pehle init ho — phir baaki sab
        Storage.init();

        // Check for existing session
        const storedId = sessionStorage.getItem('sz_my_id');
        if (storedId) {
            this.myCustomerId = parseInt(storedId, 10);
        }

        // ✅ FIX 2: Page load par listener restart karo (refresh ke baad bhi kaam kare)
        const myToken = sessionStorage.getItem('myToken');
        if (myToken) {
            console.log('🔄 Page loaded — restarting listener for token:', myToken);
            // Thoda wait karo — Firebase ready hone do
            setTimeout(() => {
                NotifSys.listenForMyTurn(parseInt(myToken, 10));
            }, 1500);
        }

        this.bindEvents();
        this.bindRealtimeEvents();
        Dashboard.init();

        // Notification permission
        this.ensureNotificationPermission({ showBlockedAlert: false });

        // Restore last known view
        if (sessionStorage.getItem('sz_auth') === 'true') {
            this.showDashboardContent();
        } else {
            this.showCustomerView();
        }
    },

    bindEvents() {
        // Navigation
        document.getElementById('link-owner-login').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLogin();
        });

        document.getElementById('btn-cancel-login').addEventListener('click', () => {
            this.showCustomerView();
        });

        document.getElementById('btn-close-dash').addEventListener('click', () => {
            this.showCustomerView();
        });

        // Booking Form
        document.getElementById('booking-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('customer-name').value.trim();
            const phone = document.getElementById('customer-phone').value.trim();

            const phoneRegex = /^\d{10}$/;
            if (!phoneRegex.test(phone)) {
                alert('Please enter a valid 10-digit phone number.');
                return;
            }

            if (name && phone) {
                const customer = Queue.addCustomer(name, phone);
                this.myCustomerId = customer.id;

                // ✅ FIX 3: Session mein save karo
                sessionStorage.setItem('sz_my_id', customer.id.toString());
                sessionStorage.setItem('myToken', String(customer.token));
                sessionStorage.setItem('myName', customer.name);

                console.log('✅ Token booked:', customer.token, '— starting listener');

                document.getElementById('booking-form').reset();
                this.applyConfirmationUI(customer);

                // ✅ FIX 4: Listener shuru karo booking ke baad
                setTimeout(() => {
                    NotifSys.listenForMyTurn(customer.token);
                }, 500);

                this.updatePublicView();

                // Optional: notification permission maango
                this.ensureNotificationPermission({ showBlockedAlert: false });
            }
        });

        // Cancel token
        document.getElementById('btn-new-token').addEventListener('click', () => {
            if (this.myCustomerId) {
                Queue.markCanceled(this.myCustomerId);
            }
            this.myCustomerId = null;
            sessionStorage.removeItem('sz_my_id');
            sessionStorage.removeItem('myToken');
            sessionStorage.removeItem('myName');
            NotifSys.stopMyTurnListener();
            this.updatePublicView();
        });

        // Enable notifications button
        document.getElementById('btn-enable-notif').addEventListener('click', async () => {
            const granted = await this.ensureNotificationPermission({ showBlockedAlert: true });
            if (granted) {
                document.getElementById('notif-prompt').classList.add('hidden');
                NotifSys.sendNotification('Notifications Enabled', "We'll notify you when it's your turn.");
            }
        });

        // Called popup close
        const closeBtn = document.getElementById('called-popup-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideCalledPopup());
        }
        const popup = document.getElementById('called-popup');
        if (popup) {
            popup.addEventListener('click', (e) => {
                if (e.target === popup) this.hideCalledPopup();
            });
        }
    },

    async ensureNotificationPermission({ showBlockedAlert = true } = {}) {
        if (!NotifSys.supported) return false;
        const granted = await NotifSys.requestPermission();
        return granted;
    },

    bindRealtimeEvents() {
        if (this.unsubscribeQueueSync) {
            this.unsubscribeQueueSync();
        }
        this.unsubscribeQueueSync = Storage.subscribeQueue(() => this.onQueueChanged());
    },

    onQueueChanged() {
        this.updatePublicView();
        // ✅ FIX 5: checkMyStatus hataya — ab notifications.js handle karta hai
        // Sirf called-popup show karo (existing UI feature)
        this.checkMyStatusForPopup();
        if (sessionStorage.getItem('sz_auth') === 'true') {
            Dashboard.refresh();
        }
    },

    updatePublicView() {
        const waiting = Queue.getWaitingCustomers();
        document.getElementById('waiting-count').textContent = waiting.length;
        document.getElementById('est-wait-time').textContent = waiting.length * Queue.EST_WAIT_PER_PERSON;

        const queue = Queue.getQueue();
        const calledCustomer = queue
            .filter(c => c.status === 'called' && c.calledAt)
            .sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0))[0];
        const nextWaitingCustomer = queue
            .filter(c => c.status === 'waiting')
            .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0];

        const activeToken = (calledCustomer && calledCustomer.token)
            ? calledCustomer.token
            : (nextWaitingCustomer ? nextWaitingCustomer.token : '--');

        const lastCompletedCustomer = queue
            .filter(c => c.status === 'done' && c.calledAt)
            .sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0))[0];
        const lastCompletedToken = (lastCompletedCustomer && lastCompletedCustomer.token)
            ? lastCompletedCustomer.token
            : '--';

        const activeEl = document.getElementById('active-token-number');
        if (activeEl) activeEl.textContent = activeToken;
        const lastCompletedEl = document.getElementById('last-completed-token-number');
        if (lastCompletedEl) lastCompletedEl.textContent = lastCompletedToken;

        const sessionToken = sessionStorage.getItem('myToken');
        const hasActiveSession = this.myCustomerId || sessionToken;

        if (hasActiveSession) {
            let customer = this.myCustomerId
                ? Queue.getCustomerById(this.myCustomerId)
                : null;
            if (!customer && sessionToken) {
                customer = queue.find((c) => String(c.token) === sessionToken) || null;
                if (customer) {
                    this.myCustomerId = customer.id;
                    sessionStorage.setItem('sz_my_id', String(customer.id));
                }
            }
            if (customer) {
                this.applyConfirmationUI(customer);
            } else if (sessionToken) {
                this.applyConfirmationUI({
                    token: sessionToken,
                    status: 'waiting'
                });
            } else {
                this.myCustomerId = null;
                sessionStorage.removeItem('sz_my_id');
                sessionStorage.removeItem('myToken');
                sessionStorage.removeItem('myName');
                NotifSys.stopMyTurnListener();
                this.showBookingForm();
            }
        } else {
            this.showBookingForm();
        }
    },

    applyConfirmationUI(customer) {
        document.getElementById('booking-section').classList.add('hidden');
        document.getElementById('confirmation-section').classList.remove('hidden');

        document.getElementById('my-token').textContent = customer.token;
        const status = (customer.status || 'waiting').toString();
        document.getElementById('my-status').textContent =
            status.charAt(0).toUpperCase() + status.slice(1);

        const pos = this.myCustomerId
            ? Queue.getQueuePosition(this.myCustomerId)
            : -1;
        document.getElementById('my-ahead').textContent = pos >= 0 ? pos : 0;
        document.getElementById('my-est-wait').textContent =
            pos >= 0 ? Queue.calculateWaitTime(pos) : 0;

        if (NotifSys.hasPermission() || status !== 'waiting') {
            document.getElementById('notif-prompt').classList.add('hidden');
        } else {
            document.getElementById('notif-prompt').classList.remove('hidden');
        }
    },

    showBookingForm() {
        document.getElementById('booking-section').classList.remove('hidden');
        document.getElementById('confirmation-section').classList.add('hidden');
    },

    // ✅ FIX 6: Sirf called-popup ke liye — full screen alert notifications.js handle karta hai
    checkMyStatusForPopup() {
        if (!this.myCustomerId) return;
        const customer = Queue.getCustomerById(this.myCustomerId);
        if (!customer) return;

        const lastSeenCalledAt = parseInt(
            sessionStorage.getItem(`sz_calledAt_${this.myCustomerId}`) || '0', 10
        );
        const calledAt = customer.calledAt || 0;

        if (customer.status === 'called' && calledAt && calledAt !== lastSeenCalledAt) {
            sessionStorage.setItem(`sz_calledAt_${this.myCustomerId}`, String(calledAt));
            // ✅ called-popup show karo (HTML wala UI element)
            this.showCalledPopup(customer.token);
        }
    },

    showCalledPopup(tokenNum) {
        const popup = document.getElementById('called-popup');
        if (!popup) return;
        const tokenEl = document.getElementById('called-popup-token');
        if (tokenEl) tokenEl.textContent = `#${tokenNum}`;
        popup.classList.remove('hidden');
    },

    hideCalledPopup() {
        const popup = document.getElementById('called-popup');
        if (!popup) return;
        popup.classList.add('hidden');
    },

    // View Routing
    showCustomerView() {
        document.getElementById('dashboard-view').classList.add('hidden');
        document.getElementById('login-modal').classList.remove('active');
        document.getElementById('dashboard-content').classList.add('hidden');
        document.getElementById('customer-view').classList.remove('hidden');
        document.getElementById('customer-view').classList.add('active');
        this.updatePublicView();
    },

    showLogin() {
        if (sessionStorage.getItem('sz_auth') === 'true') {
            this.showDashboardContent();
            return;
        }
        document.getElementById('customer-view').classList.add('hidden');
        document.getElementById('customer-view').classList.remove('active');
        document.getElementById('dashboard-view').classList.remove('hidden');
        document.getElementById('login-modal').classList.add('active');
    },

    showDashboardContent() {
        document.getElementById('customer-view').classList.add('hidden');
        document.getElementById('customer-view').classList.remove('active');
        document.getElementById('dashboard-view').classList.remove('hidden');
        document.getElementById('login-modal').classList.remove('active');
        document.getElementById('dashboard-content').classList.remove('hidden');
        Dashboard.refresh();
    }
};

// ✅ FIX 7: DOMContentLoaded par init karo
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

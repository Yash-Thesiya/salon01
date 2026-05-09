// Main App Logic
const App = {
    unsubscribeQueueSync: null,
    myCustomerId: null,

    init() {
        // Check for existing session
        const storedId = sessionStorage.getItem('sz_my_id');
        if (storedId) {
            this.myCustomerId = parseInt(storedId, 10);
        }

        const myToken = sessionStorage.getItem('myToken');
        if (myToken) {
            NotifSys.listenForMyTurn(parseInt(myToken, 10));
        }

        this.bindEvents();
        this.bindRealtimeEvents();
        Dashboard.init();

        // Mandatory notifications: ask as soon as customer opens the app.
        this.ensureNotificationPermission({ showBlockedAlert: false });

        // Restore last known view on refresh.
        // If owner is authenticated, keep them in the dashboard (skip login modal).
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

        // Booking
        document.getElementById('booking-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('customer-name').value.trim();
            const phone = document.getElementById('customer-phone').value.trim();
            
            const phoneRegex = /^\d{10}$/;
            if (!phoneRegex.test(phone)) {
                alert("Please enter a valid 10-digit phone number.");
                return;
            }

            if (name && phone) {
                const notifReady = await this.ensureNotificationPermission({ showBlockedAlert: true });
                if (!notifReady) {
                    return;
                }

                const customer = Queue.addCustomer(name, phone);
                this.myCustomerId = customer.id;
                sessionStorage.setItem('sz_my_id', customer.id.toString());
                sessionStorage.setItem('myToken', String(customer.token));
                sessionStorage.setItem('myName', customer.name);
                NotifSys.listenForMyTurn(customer.token);
                
                document.getElementById('booking-form').reset();
                this.updatePublicView();
            }
        });

        // Cancel/New Token
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

        // Notifications
        document.getElementById('btn-enable-notif').addEventListener('click', async () => {
            const granted = await this.ensureNotificationPermission({ showBlockedAlert: true });
            if (granted) {
                document.getElementById('notif-prompt').classList.add('hidden');
                NotifSys.sendNotification("Notifications Enabled", "We'll notify you when it's your turn.");
            }
        });

        // Called popup controls
        const closeBtn = document.getElementById('called-popup-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideCalledPopup());
        }
        const popup = document.getElementById('called-popup');
        if (popup) {
            popup.addEventListener('click', (e) => {
                // click outside the card closes
                if (e.target === popup) this.hideCalledPopup();
            });
        }
    },

    async ensureNotificationPermission({ showBlockedAlert = true } = {}) {
        if (!NotifSys.supported) {
            if (showBlockedAlert) {
                alert("Notifications are mandatory for queue updates. Please use a browser that supports notifications.");
            }
            return false;
        }

        const granted = await NotifSys.requestPermission();
        if (!granted && showBlockedAlert) {
            alert("Notification access is mandatory. Please allow notifications to join and receive call updates.");
        }
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
        this.checkMyStatus();
        if (sessionStorage.getItem('sz_auth') === 'true') {
            Dashboard.refresh();
        }
    },

    updatePublicView() {
        const waiting = Queue.getWaitingCustomers();
        document.getElementById('waiting-count').textContent = waiting.length;
        document.getElementById('est-wait-time').textContent = waiting.length * Queue.EST_WAIT_PER_PERSON;

        // Live queue highlights
        const queue = Queue.getQueue();
        const calledCustomer = queue
            .filter(c => c.status === 'called' && c.calledAt)
            .sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0))[0];
        const nextWaitingCustomer = queue
            .filter(c => c.status === 'waiting')
            .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0];
        const activeToken = (calledCustomer && calledCustomer.token) ? calledCustomer.token : (nextWaitingCustomer ? nextWaitingCustomer.token : '--');

        const lastCompletedCustomer = queue
            .filter(c => c.status === 'done' && c.calledAt)
            .sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0))[0];
        const lastCompletedToken = (lastCompletedCustomer && lastCompletedCustomer.token) ? lastCompletedCustomer.token : '--';

        const activeEl = document.getElementById('active-token-number');
        if (activeEl) activeEl.textContent = activeToken;
        const lastCompletedEl = document.getElementById('last-completed-token-number');
        if (lastCompletedEl) lastCompletedEl.textContent = lastCompletedToken;

        if (this.myCustomerId) {
            const customer = Queue.getCustomerById(this.myCustomerId);
            if (customer) {
                document.getElementById('booking-section').classList.add('hidden');
                document.getElementById('confirmation-section').classList.remove('hidden');
                
                document.getElementById('my-token').textContent = customer.token;
                document.getElementById('my-status').textContent = customer.status.charAt(0).toUpperCase() + customer.status.slice(1);
                
                const pos = Queue.getQueuePosition(this.myCustomerId);
                document.getElementById('my-ahead').textContent = pos >= 0 ? pos : 0;
                document.getElementById('my-est-wait').textContent = Queue.calculateWaitTime(pos);

                if (NotifSys.hasPermission() || customer.status !== 'waiting') {
                    document.getElementById('notif-prompt').classList.add('hidden');
                } else {
                    document.getElementById('notif-prompt').classList.remove('hidden');
                }
            } else {
                // Customer not found (e.g., queue cleared)
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

    showBookingForm() {
        document.getElementById('booking-section').classList.remove('hidden');
        document.getElementById('confirmation-section').classList.add('hidden');
    },

    checkMyStatus() {
        if (!this.myCustomerId) return;
        
        const customer = Queue.getCustomerById(this.myCustomerId);
        if (!customer) return;

        // Show popup for every "called" event (keyed by calledAt so it won't miss repeats)
        const lastSeenCalledAt = parseInt(sessionStorage.getItem(`sz_calledAt_${this.myCustomerId}`) || '0', 10);
        const calledAt = customer.calledAt || 0;

        if (customer.status === 'called' && calledAt && calledAt !== lastSeenCalledAt) {
            sessionStorage.setItem(`sz_calledAt_${this.myCustomerId}`, String(calledAt));
            this.showCalledPopup(customer.token);

            if (NotifSys.hasPermission()) {
                NotifSys.sendNotification("It's Your Turn!", `Token #${customer.token}, please proceed to the salon chair.`);
            }
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
        this.checkMyStatus();
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

// Start App when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

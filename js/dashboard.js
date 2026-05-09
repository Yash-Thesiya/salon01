// Owner Dashboard Logic
const Dashboard = {
    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Auth
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const pwd = document.getElementById('owner-password').value;
            if (pwd === 'salon123') {
                sessionStorage.setItem('sz_auth', 'true');
                document.getElementById('owner-password').value = '';
                document.getElementById('login-error').classList.add('hidden');
                App.showDashboardContent();
            } else {
                document.getElementById('login-error').classList.remove('hidden');
            }
        });

        document.getElementById('btn-logout').addEventListener('click', () => {
            sessionStorage.removeItem('sz_auth');
            App.showCustomerView();
        });

        // Queue Actions
        document.getElementById('btn-call-next').addEventListener('click', () => {
            Queue.callNext();
            this.refresh();
        });

        document.getElementById('btn-clear-queue').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the entire queue data for today?')) {
                Queue.clearQueue();
                this.refresh();
            }
        });

        document.getElementById('btn-export-csv').addEventListener('click', () => {
            this.exportCSV();
        });

        // Walk-in form
        document.getElementById('walkin-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('walkin-name').value.trim();
            const phone = document.getElementById('walkin-phone').value.trim();
            
            const phoneRegex = /^\d{10}$/;
            if (!phoneRegex.test(phone)) {
                alert("Please enter a valid 10-digit phone number.");
                return;
            }

            if (name && phone) {
                Queue.addCustomer(name, phone);
                document.getElementById('walkin-form').reset();
                this.refresh();
            }
        });

        // Delegate table button clicks
        document.getElementById('queue-tbody').addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            const id = parseInt(btn.dataset.id, 10);
            const action = btn.dataset.action;

            if (action === 'done') {
                Queue.markDone(id);
            } else if (action === 'skip') {
                Queue.markSkipped(id);
            }
            this.refresh();
        });
    },

    refresh() {
        this.updateStats();
        this.renderQueueTable();
    },

    updateStats() {
        const queue = Queue.getQueue();
        const waiting = Queue.getWaitingCustomers();
        
        document.getElementById('dash-total').textContent = queue.length;
        document.getElementById('dash-waiting').textContent = waiting.length;
        
        // Calculate average wait time for 'done' customers
        const doneCustomers = queue.filter(c => c.status === 'done' && c.calledAt);
        let totalWait = 0;
        
        doneCustomers.forEach(c => {
            const waitMs = c.calledAt - c.joinedAt;
            totalWait += waitMs;
        });

        let avgWaitMins = 0;
        if (doneCustomers.length > 0) {
            avgWaitMins = Math.round((totalWait / doneCustomers.length) / 60000);
        }
        
        document.getElementById('dash-avg-wait').textContent = avgWaitMins;
    },

    renderQueueTable() {
        const tbody = document.getElementById('queue-tbody');
        const queue = Queue.getQueue();
        
        tbody.innerHTML = '';
        
        if (queue.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center">No customers today</td></tr>';
            return;
        }

        // Sort: waiting/called first, then by token number
        const sortedQueue = [...queue].sort((a, b) => {
            const isAActive = a.status === 'waiting' || a.status === 'called';
            const isBActive = b.status === 'waiting' || b.status === 'called';
            
            if (isAActive && !isBActive) return -1;
            if (!isAActive && isBActive) return 1;
            return a.token - b.token;
        });

        sortedQueue.forEach(c => {
            const tr = document.createElement('tr');
            
            const waitedMins = Math.round((Date.now() - c.joinedAt) / 60000);
            
            let actionsHtml = '';
            if (c.status === 'waiting' || c.status === 'called') {
                actionsHtml = `
                    <div class="row-actions">
                        <button class="btn-success btn-sm" data-action="done" data-id="${c.id}" style="background:var(--success);color:#fff;border:none">Done</button>
                        <button class="btn-danger btn-sm" data-action="skip" data-id="${c.id}">Skip</button>
                    </div>
                `;
            }

            tr.innerHTML = `
                <td><strong>#${c.token}</strong></td>
                <td>
                    <div class="customer-info-cell">
                        <span class="c-name">${this.escapeHTML(c.name)}</span>
                        <span class="c-phone">${this.escapeHTML(c.phone)}</span>
                    </div>
                </td>
                <td>${waitedMins}m</td>
                <td><span class="status-badge status-${c.status}">${c.status}</span></td>
                <td class="text-right">${actionsHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    exportCSV() {
        const queue = Queue.getQueue();
        if (queue.length === 0) {
            alert('No data to export');
            return;
        }

        let csv = 'Token,Name,Phone,Status,Joined At,Called At\n';
        
        queue.forEach(c => {
            const joinDate = new Date(c.joinedAt).toLocaleString();
            const callDate = c.calledAt ? new Date(c.calledAt).toLocaleString() : '';
            csv += `${c.token},"${c.name}","${c.phone}",${c.status},"${joinDate}","${callDate}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `salon_queue_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

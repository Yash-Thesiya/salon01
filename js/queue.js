// Queue Logic
const Queue = {
    EST_WAIT_PER_PERSON: 15, // minutes

    addCustomer(name, phone) {
        const queue = Storage.getData();
        const tokenNum = Storage.incrementDailyCount();
        
        const customer = {
            id: Date.now(),
            token: tokenNum,
            name: name,
            phone: phone,
            joinedAt: Date.now(),
            status: "waiting", // "waiting", "called", "done", "skipped"
            calledAt: null
        };

        queue.push(customer);
        Storage.saveData(queue);
        return customer;
    },

    getQueue() {
        return Storage.getData();
    },

    getWaitingCustomers() {
        return this.getQueue().filter(c => c.status === "waiting" || c.status === "called");
    },
    
    getStrictlyWaitingCustomers() {
        return this.getQueue().filter(c => c.status === "waiting");
    },

    getCustomerById(id) {
        return this.getQueue().find(c => c.id === id);
    },

    updateCustomerStatus(id, newStatus) {
        const queue = this.getQueue();
        const index = queue.findIndex(c => c.id === id);
        
        if (index !== -1) {
            queue[index].status = newStatus;
            if (newStatus === 'called') {
                queue[index].calledAt = Date.now();
            }
            Storage.saveData(queue);
            return true;
        }
        return false;
    },

    callNext() {
        // Auto-mark currently called customer(s) as done
        const currentlyCalled = this.getQueue().filter(c => c.status === 'called');
        currentlyCalled.forEach(c => {
            this.markDone(c.id);
        });

        const waiting = this.getStrictlyWaitingCustomers();
        if (waiting.length > 0) {
            this.updateCustomerStatus(waiting[0].id, 'called');
            return waiting[0];
        }
        return null;
    },

    markDone(id) {
        return this.updateCustomerStatus(id, 'done');
    },

    markSkipped(id) {
        return this.updateCustomerStatus(id, 'skipped');
    },

    markCanceled(id) {
        return this.updateCustomerStatus(id, 'canceled');
    },

    getQueuePosition(id) {
        const waiting = this.getWaitingCustomers();
        const index = waiting.findIndex(c => c.id === id);
        return index; // 0 means next, 1 means 1 person ahead, etc.
    },

    calculateWaitTime(position) {
        if (position < 0) return 0;
        return position * this.EST_WAIT_PER_PERSON;
    },

    clearQueue() {
        Storage.clearData();
    }
};

// Browser Push Notifications
const NotifSys = {
    supported: 'Notification' in window,

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
    }
};

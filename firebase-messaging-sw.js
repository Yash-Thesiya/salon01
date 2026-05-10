importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDjZu8fWDOGfqKWgkDN4kzPuulXL5ju8oQ",
    authDomain: "salon01-4c7e6.firebaseapp.com",
    projectId: "salon01-4c7e6",
    storageBucket: "salon01-4c7e6.firebasestorage.app",
    messagingSenderId: "301498979601",
    appId: "1:301498979601:web:85a893a8124e4a4eb568b0"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification;
    self.registration.showNotification(title, {
        body: body,
        icon: '/assets/favicon.ico',
        badge: '/assets/favicon.ico',
        requireInteraction: true,
        vibrate: [200, 100, 200]
    });
});
